import { Injectable } from "@nestjs/common";
import { Prisma } from "@gurukulam/db";
import type {
  Certificate, CertificateQuery, IssueCertificateInput, Page, Principal,
  RevokeCertificateInput, Verification,
} from "@gurukulam/contracts";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.module";
import { IdService } from "../ids/id.service";
import { ApiException } from "../../common/errors";
import { assertInScope, cityScope, collegeScope, liveOnly } from "../../common/scope/scope";
import { listPage, orderBy, paginate } from "../../common/scope/pagination";
import { withBusinessIdRetry } from "../../common/business-id-retry";
import { EligibilityService } from "./eligibility.service";

const SORTABLE = ["issuedDate", "certificateNumber", "createdAt"] as const;

/**
 * Certificates.
 *
 * Invariant 7 is the rule that makes this module awkward and is exactly why it
 * has to be explicit: eligibility is IDENTICAL across segments, and access is
 * NOT. A retail student downloads their own certificate; a college student
 * does not — their institution downloads it for them. Anything that treats
 * "the student earned it" as "the student may fetch it" gets this wrong.
 */
@Injectable()
export class CertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdService,
    private readonly eligibility: EligibilityService,
  ) {}

  async list(principal: Principal, query: CertificateQuery): Promise<Page<Certificate>> {
    const where: Prisma.CertificateWhereInput = {
      ...liveOnly(query.includeDeleted),
      // A certificate carries no city; scope reads through its student.
      student: {
        ...cityScope(principal),
        ...collegeScope(principal),
        deletedAt: null,
        ...(query.segment ? { enrolmentChannel: query.segment } : {}),
        ...(query.collegeId ? { collegeId: query.collegeId } : {}),
      },
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.batchId ? { batchId: query.batchId } : {}),
      ...(query.courseId ? { courseId: query.courseId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { certificateNumber: { contains: query.q, mode: "insensitive" } },
              { student: { firstName: { contains: query.q, mode: "insensitive" } } },
              { student: { studentCode: { contains: query.q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    return listPage(query, async () => {
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.certificate.findMany({
          where,
          orderBy: orderBy(query, SORTABLE, "createdAt"),
          ...paginate(query),
          include: CERT_INCLUDE,
        }),
        this.prisma.certificate.count({ where }),
      ]);
      return [rows.map(toCertificate), total];
    });
  }

  async get(principal: Principal, certificateId: string): Promise<Certificate> {
    const certificate = await this.loadForAccess(principal, certificateId);
    return toCertificate(certificate);
  }

  async checkEligibility(principal: Principal, studentId: string, batchId: string) {
    const student = await this.prisma.student.findFirst({ where: { studentId, deletedAt: null } });
    if (!student) throw ApiException.notFound("Student");
    assertInScope(principal, student);
    return this.eligibility.evaluate(studentId, batchId);
  }

  /**
   * Issues directly. This is the retail path and the admin override for any
   * segment — the admin portal performs every action the deferred portals
   * will.
   *
   * A college's certificates normally arrive through the submission flow
   * (invariant 18); this endpoint does not bypass that rule so much as
   * represent the admin who would otherwise approve the row.
   */
  async issue(principal: Principal, input: IssueCertificateInput): Promise<Certificate> {
    const student = await this.prisma.student.findFirst({
      where: { studentId: input.studentId, deletedAt: null },
    });
    if (!student) throw ApiException.validation({ studentId: "That student no longer exists" });
    assertInScope(principal, student);

    const batch = await this.prisma.batch.findFirst({
      where: { batchId: input.batchId, deletedAt: null },
      select: { batchId: true, courseId: true },
    });
    if (!batch) throw ApiException.validation({ batchId: "That batch no longer exists" });

    const eligibility = await this.eligibility.evaluate(input.studentId, input.batchId);
    if (!eligibility.eligible && !input.overrideBlockers) {
      throw ApiException.invariant(
        `Not eligible: ${eligibility.blockers.join("; ")}. Override deliberately if this is correct.`,
      );
    }
    if (input.overrideBlockers && !eligibility.eligible && !input.overrideReason) {
      throw ApiException.validation({
        overrideReason: "Say why this is being issued despite the blockers",
      });
    }

    return this.createCertificate(principal, {
      studentId: input.studentId,
      courseId: batch.courseId,
      batchId: input.batchId,
      submissionRowId: null,
    });
  }

  /**
   * Revocation takes effect on the public verifier IMMEDIATELY — there is no
   * cached copy to expire, because the verifier reads the row.
   */
  async revoke(principal: Principal, certificateId: string, input: RevokeCertificateInput) {
    const certificate = await this.loadForAccess(principal, certificateId);
    if (certificate.status === "REVOKED") {
      throw ApiException.conflict("That certificate is already revoked.");
    }

    const updated = await this.prisma.certificate.update({
      where: { certificateId },
      data: {
        status: "REVOKED",
        revokedAt: new Date(),
        revokedBy: principal.id,
        revokedReason: input.reason,
      },
      include: CERT_INCLUDE,
    });
    return toCertificate(updated);
  }

  /**
   * The download.
   *
   * Invariant 7 lives here. A retail student may fetch their own; a COLLEGE
   * student may not fetch theirs at all — their institution does. Getting this
   * backwards is invisible until a college complains that its students went
   * around it.
   */
  async download(principal: Principal, certificateId: string) {
    const certificate = await this.loadForAccess(principal, certificateId);

    if (certificate.status !== "ISSUED") {
      throw ApiException.conflict(
        certificate.status === "REVOKED"
          ? "That certificate has been revoked."
          : "That certificate has not been issued yet.",
      );
    }

    return {
      certificateId: certificate.certificateId,
      certificateNumber: certificate.certificateNumber,
      // The signed S3 URL lands with the storage integration; the access
      // decision above is the part that must be right now.
      url: certificate.pdfUrl,
      verificationCode: certificate.verificationCode,
    };
  }

  /** Public. Reads the row, so a revocation is visible the moment it happens. */
  async verify(code: string): Promise<Verification> {
    const certificate = await this.prisma.certificate.findFirst({
      where: { verificationCode: code },
      include: { student: true, course: { select: { name: true } } },
    });

    if (!certificate || certificate.deletedAt !== null) {
      // Deliberately indistinguishable from an unknown code — confirming that
      // a code exists but was withdrawn tells a stranger more than they need.
      return {
        valid: false, certificateNumber: null, studentName: null,
        courseName: null, issuedDate: null, status: null, revokedAt: null,
      };
    }

    return {
      valid: certificate.status === "ISSUED",
      certificateNumber: certificate.certificateNumber,
      studentName: [certificate.student.firstName, certificate.student.lastName]
        .filter(Boolean).join(" "),
      courseName: certificate.course?.name ?? null,
      issuedDate: certificate.issuedDate?.toISOString().slice(0, 10) ?? null,
      status: certificate.status,
      revokedAt: certificate.revokedAt?.toISOString() ?? null,
    };
  }

  /** Shared by direct issue and submission release. */
  async createCertificate(
    principal: Principal,
    input: { studentId: string; courseId: string; batchId: string; submissionRowId: string | null },
    tx?: Prisma.TransactionClient,
  ): Promise<Certificate> {
    const client = tx ?? this.prisma;

    const existing = await client.certificate.findFirst({
      where: {
        studentId: input.studentId, batchId: input.batchId,
        deletedAt: null, status: { in: ["DRAFT", "ISSUED"] },
      },
    });
    if (existing) {
      throw ApiException.conflict("This student already holds a certificate for that batch.");
    }

    const run = async (client: Prisma.TransactionClient | PrismaService) => {
      const certificateNumber = await this.ids.certificateCode();
      const certificate = await client.certificate.create({
        data: {
          certificateNumber,
          // Distinct from the number and unguessable: the number appears on
          // the printed certificate, so anyone holding a photo of one could
          // otherwise enumerate the register.
          verificationCode: randomBytes(16).toString("base64url"),
          studentId: input.studentId,
          courseId: input.courseId,
          batchId: input.batchId,
          submissionRowId: input.submissionRowId,
          status: "ISSUED",
          issuedDate: new Date(),
          issuedBy: principal.id,
          createdBy: principal.id,
        },
        include: CERT_INCLUDE,
      });
      return toCertificate(certificate);
    };

    return tx ? run(tx) : withBusinessIdRetry(() => run(this.prisma));
  }

  private async loadForAccess(principal: Principal, certificateId: string) {
    const certificate = await this.prisma.certificate.findFirst({
      where: { certificateId, deletedAt: null },
      include: CERT_INCLUDE,
    });
    if (!certificate) throw ApiException.notFound("Certificate");

    const verdict = certificateAccess(principal, {
      studentId: certificate.studentId,
      collegeId: certificate.student.collegeId,
      enrolmentChannel: certificate.student.enrolmentChannel,
    });

    if (verdict === "SCOPED") {
      assertInScope(principal, certificate.student);
      return certificate;
    }
    if (verdict === "ALLOW") return certificate;
    if (verdict === "COLLEGE_HOLDS_IT") {
      throw ApiException.forbidden(
        "Your college holds your certificate. Ask your training and placement office for it.",
      );
    }
    throw ApiException.outOfScope();
  }
}

/**
 * Invariant 7's access rule, as a pure function.
 *
 * Extracted deliberately: eligibility is identical across segments and ACCESS
 * is not, which is the sort of asymmetry that is invisible until a college
 * complains that its students went around it. As a function it can be asserted
 * directly, including for the STUDENT actor whose portal does not exist yet
 * and therefore cannot be exercised over HTTP.
 *
 *   ADMIN_USER / API_CLIENT / SYSTEM → SCOPED (city scope still applies)
 *   COLLEGE_USER                     → their own college's students
 *   STUDENT                          → their own, and ONLY if retail
 *   TRAINER                          → nothing
 */
export type AccessVerdict = "ALLOW" | "SCOPED" | "DENY" | "COLLEGE_HOLDS_IT";

export function certificateAccess(
  principal: Pick<Principal, "actor" | "id" | "collegeScope">,
  certificate: { studentId: string; collegeId: string | null; enrolmentChannel: "RETAIL" | "COLLEGE" },
): AccessVerdict {
  switch (principal.actor) {
    case "ADMIN_USER":
    case "API_CLIENT":
    case "SYSTEM":
      return "SCOPED";

    case "COLLEGE_USER":
      // A retail student has no college, so no college reaches them either.
      return certificate.collegeId !== null && certificate.collegeId === principal.collegeScope
        ? "ALLOW"
        : "DENY";

    case "STUDENT":
      if (certificate.studentId !== principal.id) return "DENY";
      // The asymmetry: a college student earned it identically and still
      // cannot fetch it. Their institution downloads it for them.
      return certificate.enrolmentChannel === "COLLEGE" ? "COLLEGE_HOLDS_IT" : "ALLOW";

    default:
      return "DENY";
  }
}

const CERT_INCLUDE = {
  student: true,
  course: { select: { name: true } },
  batch: { select: { batchCode: true } },
} satisfies Prisma.CertificateInclude;

type CertRow = Prisma.CertificateGetPayload<{ include: typeof CERT_INCLUDE }>;

export function toCertificate(row: CertRow): Certificate {
  return {
    certificateId: row.certificateId,
    certificateNumber: row.certificateNumber,
    verificationCode: row.verificationCode,
    studentId: row.studentId,
    studentCode: row.student?.studentCode ?? null,
    studentName: row.student
      ? [row.student.firstName, row.student.lastName].filter(Boolean).join(" ")
      : null,
    courseId: row.courseId,
    courseName: row.course?.name ?? null,
    batchId: row.batchId,
    batchCode: row.batch?.batchCode ?? null,
    segment: row.student?.enrolmentChannel,
    submissionRowId: row.submissionRowId,
    status: row.status,
    issuedDate: row.issuedDate?.toISOString().slice(0, 10) ?? null,
    pdfUrl: row.pdfUrl,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    revokedReason: row.revokedReason,
    createdAt: row.createdAt.toISOString(),
  };
}
