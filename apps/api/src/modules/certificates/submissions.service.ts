import { Injectable } from "@nestjs/common";
import { Prisma } from "@gurukulam/db";
import type {
  CreateSubmissionInput, DecideRowInput, Page, Principal, Submission, SubmissionQuery,
} from "@gurukulam/contracts";
import { PrismaService } from "../prisma/prisma.module";
import { ApiException } from "../../common/errors";
import { assertInScope, cityScope, liveOnly } from "../../common/scope/scope";
import { listPage, orderBy, paginate } from "../../common/scope/pagination";
import { EligibilityService } from "./eligibility.service";
import { CertificatesService } from "./certificates.service";

const SORTABLE = ["submittedAt", "status"] as const;

/**
 * Certificate submissions — invariant 18.
 *
 * A college POC uploads a list of names against a completed training. An admin
 * matches each to a student record, sees attendance and assignment completion,
 * and decides PER ROW. Only approved rows become certificates, and only a
 * released submission is downloadable.
 *
 * The rule stated plainly: **an uploaded name is not a certificate.** The
 * uploaded text is kept verbatim even after matching, because it is what the
 * college actually sent and is the only way to explain a mismatch later.
 */
@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eligibility: EligibilityService,
    private readonly certificates: CertificatesService,
  ) {}

  async list(principal: Principal, query: SubmissionQuery): Promise<Page<Submission>> {
    const where: Prisma.CertificateSubmissionWhereInput = {
      ...liveOnly(query.includeDeleted),
      ...(principal.collegeScope !== null ? { collegeId: principal.collegeScope } : {}),
      college: { ...cityScope(principal), deletedAt: null },
      ...(query.collegeId ? { collegeId: query.collegeId } : {}),
      ...(query.batchId ? { batchId: query.batchId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    return listPage(query, async () => {
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.certificateSubmission.findMany({
          where,
          orderBy: orderBy(query, SORTABLE, "submittedAt"),
          ...paginate(query),
          include: SUBMISSION_INCLUDE,
        }),
        this.prisma.certificateSubmission.count({ where }),
      ]);
      return [rows.map(toSubmission), total];
    });
  }

  /**
   * The review table. Every pending row carries its eligibility, so nobody
   * approves blind — that is the point of the screen.
   */
  async get(principal: Principal, submissionId: string) {
    const submission = await this.mustExist(principal, submissionId);

    const rows = await this.prisma.certificateSubmissionRow.findMany({
      where: { submissionId, deletedAt: null },
      orderBy: { uploadedName: "asc" },
      include: { student: { select: { studentCode: true } }, certificate: { select: { certificateId: true } } },
    });

    const withEligibility = await Promise.all(
      rows.map(async (row) => ({
        rowId: row.rowId,
        submissionId: row.submissionId,
        uploadedName: row.uploadedName,
        uploadedEmail: row.uploadedEmail,
        uploadedRef: row.uploadedRef,
        studentId: row.studentId,
        studentCode: row.student?.studentCode ?? null,
        status: row.status,
        rejectionReason: row.rejectionReason,
        decidedAt: row.decidedAt?.toISOString() ?? null,
        certificateId: row.certificate?.certificateId ?? null,
        eligibility: row.studentId
          ? await this.eligibility.evaluate(row.studentId, submission.batchId)
          : null,
      })),
    );

    return { ...toSubmission(submission), rows: withEligibility };
  }

  /**
   * A college uploads its list. Admins can do this on a college's behalf —
   * the admin portal performs every action the deferred portals will.
   */
  async create(principal: Principal, input: CreateSubmissionInput, collegeId?: string) {
    const targetCollegeId = principal.collegeScope ?? collegeId;
    if (!targetCollegeId) {
      throw ApiException.validation({ collegeId: "Select the college this list is for" });
    }

    const batch = await this.prisma.batch.findFirst({
      where: { batchId: input.batchId, deletedAt: null },
      select: { batchId: true, collegeId: true, status: true },
    });
    if (!batch) throw ApiException.validation({ batchId: "That training no longer exists" });

    // A college can only submit against its OWN dedicated batch. Submitting
    // against a retail batch, or another college's, is meaningless.
    if (batch.collegeId !== targetCollegeId) {
      throw ApiException.validation({
        batchId: "That training is not dedicated to this college",
      });
    }

    const college = await this.prisma.college.findFirstOrThrow({
      where: { collegeId: targetCollegeId },
      select: { collegeId: true, cityId: true },
    });
    assertInScope(principal, { cityId: college.cityId, collegeId: college.collegeId });

    const submission = await this.prisma.$transaction(async (tx) => {
      const created = await tx.certificateSubmission.create({
        data: {
          collegeId: targetCollegeId,
          batchId: input.batchId,
          submittedByCollegeUserId: principal.actor === "COLLEGE_USER" ? principal.id : null,
          status: "SUBMITTED",
          createdBy: principal.id,
        },
      });

      await tx.certificateSubmissionRow.createMany({
        data: input.names.map((n) => ({
          submissionId: created.submissionId,
          // Kept verbatim. Matching fills studentId alongside it rather than
          // replacing it, so a mismatch stays explicable a year later.
          uploadedName: n.name,
          uploadedEmail: n.email || null,
          uploadedRef: n.ref || null,
          createdBy: principal.id,
        })),
      });

      return created;
    });

    return this.get(principal, submission.submissionId);
  }

  /**
   * An admin's decision on ONE uploaded name.
   *
   * Approving does not yet mint a certificate — the submission is released as
   * a whole, so a college gets a complete list rather than a trickle.
   */
  async decideRow(principal: Principal, rowId: string, input: DecideRowInput) {
    // Only an admin decides. A college approving its own list would make the
    // review meaningless.
    if (principal.collegeScope !== null) throw ApiException.forbidden();

    const row = await this.prisma.certificateSubmissionRow.findFirst({
      where: { rowId, deletedAt: null },
      include: { submission: { include: { college: { select: { cityId: true } } } } },
    });
    if (!row) throw ApiException.notFound("Submission row");
    assertInScope(principal, {
      cityId: row.submission.college.cityId,
      collegeId: row.submission.collegeId,
    });

    if (row.submission.status === "RELEASED") {
      throw ApiException.conflict("That submission has already been released.");
    }

    if (input.decision === "REJECT") {
      const updated = await this.prisma.$transaction(async (tx) => {
        const r = await tx.certificateSubmissionRow.update({
          where: { rowId },
          data: {
            status: "REJECTED",
            rejectionReason: input.reason ?? null,
            studentId: input.studentId ?? row.studentId,
            decidedBy: principal.id,
            decidedAt: new Date(),
          },
        });
        await this.advanceToUnderReview(tx, row.submissionId);
        return r;
      });
      return { rowId: updated.rowId, status: updated.status, rejectionReason: updated.rejectionReason };
    }

    const studentId = input.studentId!;
    const student = await this.prisma.student.findFirst({
      where: { studentId, deletedAt: null },
      select: { studentId: true, collegeId: true },
    });
    if (!student) throw ApiException.validation({ studentId: "That student no longer exists" });

    // The match must be to a student of THIS college. Approving a name onto
    // someone else's record is the worst thing this screen could do.
    if (student.collegeId !== row.submission.collegeId) {
      throw ApiException.validation({
        studentId: "That student does not belong to this college",
      });
    }

    const eligibility = await this.eligibility.evaluate(studentId, row.submission.batchId);
    if (!eligibility.eligible && !input.overrideBlockers) {
      throw ApiException.invariant(
        `Not eligible: ${eligibility.blockers.join("; ")}. Override deliberately if this is correct.`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const r = await tx.certificateSubmissionRow.update({
        where: { rowId },
        data: {
          status: "APPROVED",
          studentId,
          rejectionReason: null,
          decidedBy: principal.id,
          decidedAt: new Date(),
        },
      });
      await this.advanceToUnderReview(tx, row.submissionId);
      return r;
    });

    return { rowId: updated.rowId, status: updated.status, studentId, eligibility };
  }

  /**
   * Releases the submission: every APPROVED row becomes a certificate, in one
   * transaction. Nothing before this point is a certificate (invariant 18).
   */
  async release(principal: Principal, submissionId: string) {
    if (principal.collegeScope !== null) throw ApiException.forbidden();
    const submission = await this.mustExist(principal, submissionId);

    if (submission.status === "RELEASED") {
      throw ApiException.conflict("That submission has already been released.");
    }

    const rows = await this.prisma.certificateSubmissionRow.findMany({
      where: { submissionId, deletedAt: null },
    });
    const pending = rows.filter((r) => r.status === "PENDING");
    if (pending.length > 0) {
      throw ApiException.conflict(
        `${pending.length} name${pending.length === 1 ? " has" : "s have"} not been decided yet.`,
      );
    }

    const approved = rows.filter((r) => r.status === "APPROVED" && r.studentId !== null);
    if (approved.length === 0) {
      throw ApiException.conflict("No name on this submission was approved.");
    }

    const issued = await this.prisma.$transaction(async (tx) => {
      const created = [];
      for (const row of approved) {
        const certificate = await this.certificates.createCertificate(
          principal,
          {
            studentId: row.studentId!,
            courseId: (await tx.batch.findUniqueOrThrow({
              where: { batchId: submission.batchId },
              select: { courseId: true },
            })).courseId,
            batchId: submission.batchId,
            // The link back to the approved row is what makes invariant 18
            // auditable: every college certificate can name the row that
            // produced it.
            submissionRowId: row.rowId,
          },
          tx,
        );
        created.push(certificate);
      }

      await tx.certificateSubmission.update({
        where: { submissionId },
        data: {
          status: "RELEASED",
          reviewedBy: principal.id,
          reviewedAt: submission.reviewedAt ?? new Date(),
          releasedAt: new Date(),
        },
      });

      return created;
    });

    return { submissionId, released: issued.length, certificates: issued };
  }

  private async advanceToUnderReview(tx: Prisma.TransactionClient, submissionId: string) {
    const submission = await tx.certificateSubmission.findUniqueOrThrow({ where: { submissionId } });
    if (submission.status === "SUBMITTED") {
      await tx.certificateSubmission.update({
        where: { submissionId },
        data: { status: "UNDER_REVIEW", reviewedAt: new Date() },
      });
    }
  }

  private async mustExist(principal: Principal, submissionId: string) {
    const submission = await this.prisma.certificateSubmission.findFirst({
      where: { submissionId, deletedAt: null },
      include: SUBMISSION_INCLUDE,
    });
    if (!submission) throw ApiException.notFound("Submission");

    if (principal.collegeScope !== null && submission.collegeId !== principal.collegeScope) {
      throw ApiException.outOfScope();
    }
    assertInScope(principal, {
      cityId: submission.college.cityId,
      collegeId: submission.collegeId,
    });
    return submission;
  }
}

const SUBMISSION_INCLUDE = {
  college: { select: { name: true, cityId: true } },
  batch: { select: { batchCode: true } },
  rows: { where: { deletedAt: null }, select: { status: true } },
} satisfies Prisma.CertificateSubmissionInclude;

type SubmissionRow = Prisma.CertificateSubmissionGetPayload<{ include: typeof SUBMISSION_INCLUDE }>;

function toSubmission(row: SubmissionRow): Submission {
  return {
    submissionId: row.submissionId,
    collegeId: row.collegeId,
    collegeName: row.college?.name ?? null,
    batchId: row.batchId,
    batchCode: row.batch?.batchCode ?? null,
    status: row.status,
    submittedAt: row.submittedAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    releasedAt: row.releasedAt?.toISOString() ?? null,
    rowCount: row.rows.length,
    approvedCount: row.rows.filter((r) => r.status === "APPROVED").length,
    rejectedCount: row.rows.filter((r) => r.status === "REJECTED").length,
    pendingCount: row.rows.filter((r) => r.status === "PENDING").length,
  };
}
