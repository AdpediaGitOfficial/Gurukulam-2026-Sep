import { Injectable } from "@nestjs/common";
import { Prisma } from "@gurukulam/db";
import { randomBytes } from "node:crypto";
import { collegeLoginEmail } from "@gurukulam/contracts";
import type {
  CollegeUser, ConfirmRequirementInput, CreateRequirementInput, GrantPortalAccessInput,
  IssuedCredential, Page, Principal, RejectRequirementInput, Requirement, RequirementQuery,
  RevokePortalAccessInput, UpdateRequirementInput,
} from "@gurukulam/contracts";
import { PrismaService } from "../prisma/prisma.module";
import { IdService } from "../ids/id.service";
import { ApiException } from "../../common/errors";
import { assertInScope, cityScope, collegeScope, liveOnly } from "../../common/scope/scope";
import { listPage, orderBy, paginate } from "../../common/scope/pagination";
import { withBusinessIdRetry } from "../../common/business-id-retry";
import { hashPassword } from "../auth/password";

const SORTABLE = ["createdAt", "requirementCode", "status"] as const;

/**
 * College requirements, and portal access.
 *
 * The requirement is the entry point of the entire college engagement:
 * `NEW → UNDER_REVIEW → CONFIRMED → FULFILLED`, with `REJECTED` terminal.
 * Confirming one CREATES its dedicated batch in the same transaction and keeps
 * the link (invariant 14) — a confirmed requirement with no batch, or a batch
 * nobody asked for, are both states someone would have to reconcile by hand.
 */
@Injectable()
export class RequirementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdService,
  ) {}

  async list(principal: Principal, query: RequirementQuery): Promise<Page<Requirement>> {
    const where: Prisma.CollegeRequirementWhereInput = {
      ...liveOnly(query.includeDeleted),
      ...collegeScope(principal),
      college: { ...cityScope(principal), deletedAt: null },
      ...(query.collegeId ? { collegeId: query.collegeId } : {}),
      ...(query.courseId ? { courseId: query.courseId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { requirementCode: { contains: query.q, mode: "insensitive" } } : {}),
    };

    return listPage(query, async () => {
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.collegeRequirement.findMany({
          where,
          orderBy: orderBy(query, SORTABLE, "createdAt"),
          ...paginate(query),
          include: REQ_INCLUDE,
        }),
        this.prisma.collegeRequirement.count({ where }),
      ]);
      return [rows.map(toRequirement), total];
    });
  }

  async get(principal: Principal, requirementId: string): Promise<Requirement> {
    return toRequirement(await this.mustExist(principal, requirementId));
  }

  /** A college user raises their own; an admin may log one on their behalf. */
  async create(principal: Principal, input: CreateRequirementInput): Promise<Requirement> {
    const collegeId = principal.collegeScope ?? input.collegeId;
    if (!collegeId) {
      throw ApiException.validation({ collegeId: "Select the college raising this" });
    }

    const college = await this.prisma.college.findFirst({
      where: { collegeId, deletedAt: null },
      select: { collegeId: true, cityId: true },
    });
    if (!college) throw ApiException.validation({ collegeId: "That college no longer exists" });
    assertInScope(principal, { cityId: college.cityId, collegeId: college.collegeId });

    const course = await this.prisma.course.findFirst({
      where: { courseId: input.courseId, deletedAt: null },
      select: { courseId: true },
    });
    if (!course) throw ApiException.validation({ courseId: "That course no longer exists" });

    return withBusinessIdRetry(async () => {
      const requirementCode = await this.ids.requirementCode();
      const requirement = await this.prisma.collegeRequirement.create({
        data: {
          requirementCode,
          collegeId,
          courseId: input.courseId,
          expectedHeadcount: input.expectedHeadcount,
          preferredMode: input.preferredMode,
          preferredWindowStart: input.preferredWindowStart ? toDate(input.preferredWindowStart) : null,
          preferredWindowEnd: input.preferredWindowEnd ? toDate(input.preferredWindowEnd) : null,
          discipline: input.discipline || null,
          source: input.source || (principal.actor === "COLLEGE_USER" ? "College portal" : null),
          notes: input.notes || null,
          createdBy: principal.id,
        },
        include: REQ_INCLUDE,
      });
      return toRequirement(requirement);
    });
  }

  async update(principal: Principal, requirementId: string, input: UpdateRequirementInput) {
    const existing = await this.mustExist(principal, requirementId);
    // Once confirmed the requirement has produced a batch; editing what was
    // asked for after the fact would leave the batch answering a question
    // nobody put.
    if (existing.status !== "NEW" && existing.status !== "UNDER_REVIEW") {
      throw ApiException.conflict(
        `This requirement is ${existing.status.toLowerCase()} and can no longer be edited.`,
      );
    }

    const requirement = await this.prisma.collegeRequirement.update({
      where: { requirementId },
      data: {
        ...(input.expectedHeadcount !== undefined ? { expectedHeadcount: input.expectedHeadcount } : {}),
        ...(input.preferredMode !== undefined ? { preferredMode: input.preferredMode } : {}),
        ...(input.preferredWindowStart !== undefined
          ? { preferredWindowStart: input.preferredWindowStart ? toDate(input.preferredWindowStart) : null }
          : {}),
        ...(input.preferredWindowEnd !== undefined
          ? { preferredWindowEnd: input.preferredWindowEnd ? toDate(input.preferredWindowEnd) : null }
          : {}),
        ...(input.discipline !== undefined ? { discipline: input.discipline || null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
      include: REQ_INCLUDE,
    });
    return toRequirement(requirement);
  }

  /**
   * Confirmation — the act that turns a request into delivery.
   *
   * Creates the dedicated batch and links it back in ONE transaction
   * (invariant 14). The batch carries the college, so the roster rule
   * (invariant 2) applies to it from the moment it exists.
   */
  async confirm(principal: Principal, requirementId: string, input: ConfirmRequirementInput) {
    // A college cannot confirm its own requirement — colleges do not create
    // batches; an admin does, from a confirmed requirement.
    if (principal.collegeScope !== null) throw ApiException.forbidden();

    const requirement = await this.mustExist(principal, requirementId);
    if (requirement.status === "CONFIRMED" || requirement.batchId) {
      throw ApiException.conflict("That requirement has already produced a batch.");
    }
    if (requirement.status === "REJECTED") {
      throw ApiException.conflict("A rejected requirement cannot be confirmed.");
    }

    const startDate = toDate(input.startDate);
    const endDate = input.endDate ? toDate(input.endDate) : null;
    if (endDate && endDate < startDate) {
      throw ApiException.validation({ endDate: "The batch cannot end before it starts" });
    }

    const course = await this.prisma.course.findUniqueOrThrow({
      where: { courseId: requirement.courseId },
      select: { name: true },
    });

    return withBusinessIdRetry(async () => {
      const batchCode = await this.ids.batchCode(course.name, startDate);

      return this.prisma.$transaction(async (tx) => {
        const batch = await tx.batch.create({
          data: {
            batchCode,
            name: input.batchName,
            courseId: requirement.courseId,
            // Dedicated to this college from the outset.
            collegeId: requirement.collegeId,
            cityId: requirement.college.cityId,
            mode: input.mode ?? requirement.preferredMode,
            startDate,
            endDate,
            maxCapacity: input.maxCapacity ?? requirement.expectedHeadcount,
            venue: input.venue || null,
            meetingLink: input.meetingLink || null,
            createdBy: principal.id,
          },
        });

        const updated = await tx.collegeRequirement.update({
          where: { requirementId },
          data: {
            status: "CONFIRMED",
            confirmedBy: principal.id,
            confirmedAt: new Date(),
            batchId: batch.batchId,
          },
          include: REQ_INCLUDE,
        });

        return toRequirement(updated);
      });
    });
  }

  async reject(principal: Principal, requirementId: string, input: RejectRequirementInput) {
    if (principal.collegeScope !== null) throw ApiException.forbidden();
    const requirement = await this.mustExist(principal, requirementId);
    if (requirement.status === "CONFIRMED") {
      throw ApiException.conflict("That requirement has already produced a batch.");
    }

    const updated = await this.prisma.collegeRequirement.update({
      where: { requirementId },
      data: { status: "REJECTED", rejectionReason: input.reason },
      include: REQ_INCLUDE,
    });
    return toRequirement(updated);
  }

  /** Marked fulfilled when its batch completes. */
  async markFulfilled(principal: Principal, requirementId: string) {
    if (principal.collegeScope !== null) throw ApiException.forbidden();
    const requirement = await this.mustExist(principal, requirementId);
    if (requirement.status !== "CONFIRMED") {
      throw ApiException.conflict("Only a confirmed requirement can be fulfilled.");
    }
    const updated = await this.prisma.collegeRequirement.update({
      where: { requirementId }, data: { status: "FULFILLED" }, include: REQ_INCLUDE,
    });
    return toRequirement(updated);
  }

  private async mustExist(principal: Principal, requirementId: string) {
    const requirement = await this.prisma.collegeRequirement.findFirst({
      where: { requirementId, deletedAt: null },
      include: REQ_INCLUDE,
    });
    if (!requirement) throw ApiException.notFound("Requirement");
    if (principal.collegeScope !== null && requirement.collegeId !== principal.collegeScope) {
      throw ApiException.outOfScope();
    }
    assertInScope(principal, {
      cityId: requirement.college.cityId,
      collegeId: requirement.collegeId,
    });
    return requirement;
  }
}

/**
 * Portal access — the college portal's entire server side, testable now even
 * though its UI does not exist.
 */
@Injectable()
export class PortalAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async list(principal: Principal, collegeId: string): Promise<CollegeUser[]> {
    const college = await this.mustFindCollege(principal, collegeId);
    const users = await this.prisma.collegeUser.findMany({
      where: { collegeId: college.collegeId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: { college: { select: { name: true } } },
    });
    return users.map(toCollegeUser);
  }

  /**
   * Granting access emails the contact their credentials immediately.
   *
   * The temporary password is returned ONCE and only its hash is stored — a
   * credential that can be re-read later is a credential the operator can leak
   * without knowing.
   */
  async grant(
    principal: Principal,
    collegeId: string,
    input: GrantPortalAccessInput,
  ): Promise<IssuedCredential> {
    // A college cannot grant itself further logins.
    if (principal.collegeScope !== null) throw ApiException.forbidden();
    const college = await this.mustFindCollege(principal, collegeId);

    let name = input.name;
    let email = input.email;
    let pocId = input.pocId ?? null;

    if (pocId) {
      const poc = await this.prisma.collegePoc.findFirst({
        where: { pocId, collegeId: college.collegeId, deletedAt: null },
      });
      if (!poc) throw ApiException.validation({ pocId: "That contact is not at this college" });
      name ??= poc.name;
      email ??= poc.email;
    }

    if (!name || !email) {
      throw ApiException.validation({
        pocId: "Choose a contact, or supply a name and email directly",
      });
    }

    const existing = await this.prisma.collegeUser.findFirst({
      where: { collegeId: college.collegeId, email: { equals: email, mode: "insensitive" }, deletedAt: null },
    });

    // The login identity is derived from the college's immutable code, so it
    // is stable and unique by construction. A second user at the same college
    // takes a numbered variant rather than colliding.
    const loginEmail = await this.freeLoginEmail(college.collegeCode, existing?.collegeUserId);
    const temporaryPassword = randomBytes(9).toString("base64url");

    const user = existing
      ? await this.prisma.collegeUser.update({
          where: { collegeUserId: existing.collegeUserId },
          data: {
            name, loginEmail,
            passwordHash: hashPassword(temporaryPassword),
            mustReset: true,
            accessStatus: "GRANTED",
            accountStatus: "ACTIVE",
            grantedAt: new Date(),
            revokedAt: null,
            permissions: DEFAULT_COLLEGE_PERMISSIONS,
          },
        })
      : await this.prisma.collegeUser.create({
          data: {
            collegeId: college.collegeId,
            pocId,
            name,
            email,
            loginEmail,
            phone: input.phone || null,
            passwordHash: hashPassword(temporaryPassword),
            mustReset: true,
            accessStatus: "GRANTED",
            grantedAt: new Date(),
            permissions: DEFAULT_COLLEGE_PERMISSIONS,
            createdBy: principal.id,
          },
        });

    return {
      collegeUserId: user.collegeUserId,
      loginEmail,
      temporaryPassword,
      mustResetPassword: true,
    };
  }

  /**
   * Revoking stops the account working immediately — the principal builder
   * refuses anything but GRANTED, so it does not wait for token expiry.
   */
  async revoke(principal: Principal, collegeUserId: string, input: RevokePortalAccessInput) {
    if (principal.collegeScope !== null) throw ApiException.forbidden();

    const user = await this.prisma.collegeUser.findFirst({
      where: { collegeUserId, deletedAt: null },
      include: { college: { select: { name: true, cityId: true } } },
    });
    if (!user) throw ApiException.notFound("Portal user");
    assertInScope(principal, { cityId: user.college.cityId, collegeId: user.collegeId });

    if (user.accessStatus === "REVOKED") {
      throw ApiException.conflict("That account's access is already revoked.");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.collegeUser.update({
        where: { collegeUserId },
        data: {
          accessStatus: "REVOKED",
          revokedAt: new Date(),
          // The hash is cleared as well as the status: a revoked account that
          // still holds a working password is one configuration slip from
          // being live again.
          passwordHash: null,
        },
        include: { college: { select: { name: true } } },
      });

      // Existing sessions die with it, rather than lasting until the refresh
      // token expires.
      await tx.refreshToken.updateMany({
        where: { actorType: "COLLEGE_USER", actorId: collegeUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      return u;
    });

    void input;
    return toCollegeUser(updated);
  }

  private async freeLoginEmail(collegeCode: string, ignoreUserId?: string): Promise<string> {
    const base = collegeLoginEmail(collegeCode);
    const [local, domain] = base.split("@") as [string, string];
    for (let n = 0; n < 100; n++) {
      const candidate = n === 0 ? base : `${local}${n + 1}@${domain}`;
      const taken = await this.prisma.collegeUser.findFirst({
        where: {
          loginEmail: { equals: candidate, mode: "insensitive" },
          deletedAt: null,
          ...(ignoreUserId ? { collegeUserId: { not: ignoreUserId } } : {}),
        },
        select: { collegeUserId: true },
      });
      if (!taken) return candidate;
    }
    throw ApiException.conflict("Could not derive a free login identity for that college");
  }

  private async mustFindCollege(principal: Principal, collegeId: string) {
    const college = await this.prisma.college.findFirst({
      where: { collegeId, deletedAt: null },
      select: { collegeId: true, collegeCode: true, cityId: true },
    });
    if (!college) throw ApiException.notFound("College");
    assertInScope(principal, { cityId: college.cityId, collegeId: college.collegeId });
    return college;
  }
}

/** What a college portal login can reach. Mirrors the seed, deliberately. */
const DEFAULT_COLLEGE_PERMISSIONS = {
  dashboard: { read: true, edit: false, delete: false },
  colleges: { read: true, edit: false, delete: false },
  requirements: { read: true, edit: true, delete: false },
  students: { read: true, edit: true, delete: false },
  certificates: { read: true, edit: true, delete: false },
} as const;

const REQ_INCLUDE = {
  college: { select: { name: true, cityId: true } },
  course: { select: { name: true } },
  batch: { select: { batchCode: true } },
} satisfies Prisma.CollegeRequirementInclude;

function toRequirement(row: Prisma.CollegeRequirementGetPayload<{ include: typeof REQ_INCLUDE }>): Requirement {
  return {
    requirementId: row.requirementId,
    requirementCode: row.requirementCode,
    collegeId: row.collegeId,
    collegeName: row.college?.name ?? null,
    courseId: row.courseId,
    courseName: row.course?.name ?? null,
    expectedHeadcount: row.expectedHeadcount,
    preferredMode: row.preferredMode,
    preferredWindowStart: row.preferredWindowStart?.toISOString().slice(0, 10) ?? null,
    preferredWindowEnd: row.preferredWindowEnd?.toISOString().slice(0, 10) ?? null,
    discipline: row.discipline,
    source: row.source,
    notes: row.notes,
    status: row.status,
    rejectionReason: row.rejectionReason,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    batchId: row.batchId,
    batchCode: row.batch?.batchCode ?? null,
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

function toCollegeUser(row: {
  collegeUserId: string; collegeId: string; pocId: string | null; name: string;
  email: string; loginEmail: string | null; phone: string | null;
  accessStatus: string; accountStatus: string; grantedAt: Date | null;
  revokedAt: Date | null; lastLoginAt: Date | null; createdAt: Date;
  college?: { name: string } | null;
}): CollegeUser {
  return {
    collegeUserId: row.collegeUserId,
    collegeId: row.collegeId,
    collegeName: row.college?.name ?? null,
    pocId: row.pocId,
    name: row.name,
    email: row.email,
    loginEmail: row.loginEmail,
    phone: row.phone,
    accessStatus: row.accessStatus as CollegeUser["accessStatus"],
    accountStatus: row.accountStatus as CollegeUser["accountStatus"],
    grantedAt: row.grantedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
  // password_hash is deliberately absent.
}

const toDate = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
