import { Injectable } from "@nestjs/common";
import { Prisma } from "@gurukulam/db";
import {
  parseRupees,
  type CreateJobInput, type JobPosting, type JobQuery, type Page, type Principal, type UpdateJobInput,
} from "@gurukulam/contracts";
import { PrismaService } from "../prisma/prisma.module";
import { IdService } from "../ids/id.service";
import { ApiException } from "../../common/errors";
import { withBusinessIdRetry } from "../../common/business-id-retry";
import { liveOnly } from "../../common/scope/scope";
import { listPage, orderBy, paginate } from "../../common/scope/pagination";

const SORTABLE = ["createdAt", "roleTitle", "companyName", "closingDate"] as const;

/**
 * Hiring.
 *
 * The rule that shapes this whole module: job audience is evaluated at READ
 * time and never materialised per student (invariant 10). Writing a row per
 * student per posting would look faster and be wrong in two ways that only
 * show up later — a student who enrols tomorrow silently misses the posting,
 * and a student transferred between batches keeps a grant they should have
 * lost.
 *
 * So `audienceWhere` builds a predicate over students, and both the reach
 * preview and (eventually) the student portal's feed run the same one.
 */
@Injectable()
export class HiringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdService,
  ) {}

  async list(_principal: Principal, query: JobQuery): Promise<Page<JobPosting>> {
    const where: Prisma.JobPostingWhereInput = {
      ...liveOnly(query.includeDeleted),
      ...(query.status ? { status: query.status } : {}),
      ...(query.courseId
        ? { audienceRules: { some: { courseId: query.courseId, deletedAt: null } } }
        : {}),
      ...(query.q
        ? {
            OR: [
              { roleTitle: { contains: query.q, mode: "insensitive" } },
              { companyName: { contains: query.q, mode: "insensitive" } },
              { jobCode: { contains: query.q, mode: "insensitive" } },
              { skills: { has: query.q } },
            ],
          }
        : {}),
    };

    return listPage(query, async () => {
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.jobPosting.findMany({
          where,
          orderBy: orderBy(query, SORTABLE, "createdAt"),
          ...paginate(query),
          include: { audienceRules: { where: { deletedAt: null } } },
        }),
        this.prisma.jobPosting.count({ where }),
      ]);
      return [rows.map(toJob), total];
    });
  }

  async get(_principal: Principal, jobPostingId: string) {
    const row = await this.prisma.jobPosting.findFirst({
      where: { jobPostingId, deletedAt: null },
      include: {
        audienceRules: {
          where: { deletedAt: null },
          include: { course: { select: { name: true } } },
        },
      },
    });
    if (!row) throw ApiException.notFound("Job posting");

    // The reach is computed on read, from the same predicate the feed uses —
    // so the number an operator sees before publishing is the number that will
    // actually be reached.
    return { ...toJob(row), reach: await this.reachOf(row.jobPostingId) };
  }

  async create(principal: Principal, input: CreateJobInput) {
    await this.assertAudienceValid(input.audienceRules);

    return withBusinessIdRetry(async () => {
      const jobCode = await this.ids.jobCode();
      return this.prisma.$transaction(async (tx) => {
      const row = await tx.jobPosting.create({
        data: {
          jobCode,
          roleTitle: input.roleTitle,
          companyName: input.companyName,
          workMode: input.workMode,
          skills: input.skills,
          ...this.toData(input),
          createdBy: principal.id,
          postedBy: principal.id,
          audienceRules: {
            create: input.audienceRules.map((r) => ({
              courseId: r.courseId,
              batchId: r.batchId || null,
              collegeId: r.collegeId || null,
              cityId: r.cityId || null,
              passoutYear: r.passoutYear ?? null,
              segment: r.segment ?? null,
              completedOnly: r.completedOnly,
              createdBy: principal.id,
            })),
          },
        },
        include: { audienceRules: { where: { deletedAt: null } } },
      });
        return toJob(row);
      });
    });
  }

  async update(principal: Principal, jobPostingId: string, input: UpdateJobInput) {
    await this.mustExist(jobPostingId);
    if (input.audienceRules) await this.assertAudienceValid(input.audienceRules);

    return this.prisma.$transaction(async (tx) => {
      if (input.audienceRules) {
        await tx.jobAudienceRule.updateMany({
          where: { jobPostingId, deletedAt: null },
          data: { deletedAt: new Date(), deletedBy: principal.id },
        });
        await tx.jobAudienceRule.createMany({
          data: input.audienceRules.map((r) => ({
            jobPostingId,
            courseId: r.courseId,
            batchId: r.batchId || null,
            collegeId: r.collegeId || null,
            cityId: r.cityId || null,
            passoutYear: r.passoutYear ?? null,
            segment: r.segment ?? null,
            completedOnly: r.completedOnly,
            createdBy: principal.id,
          })),
        });
      }

      const row = await tx.jobPosting.update({
        where: { jobPostingId },
        data: this.toData(input),
        include: { audienceRules: { where: { deletedAt: null } } },
      });
      return toJob(row);
    });
  }

  /**
   * DRAFT → PUBLISHED → CLOSED → ARCHIVED. Only PUBLISHED is visible to
   * students, and a posting with no audience would be published to nobody —
   * which looks identical to a broken feed.
   */
  async publish(principal: Principal, jobPostingId: string) {
    const existing = await this.mustExist(jobPostingId);
    if (existing.status !== "DRAFT") {
      throw ApiException.conflict(`Only a draft can be published; this one is ${existing.status}.`);
    }

    const rules = await this.prisma.jobAudienceRule.count({
      where: { jobPostingId, deletedAt: null },
    });
    if (rules === 0) {
      throw ApiException.validation({
        audienceRules: "Add at least one audience rule — otherwise nobody will see this posting",
      });
    }

    const row = await this.prisma.jobPosting.update({
      where: { jobPostingId },
      data: { status: "PUBLISHED", publishedAt: new Date(), postedBy: principal.id },
      include: { audienceRules: { where: { deletedAt: null } } },
    });
    return { ...toJob(row), reach: await this.reachOf(jobPostingId) };
  }

  async setStatus(principal: Principal, jobPostingId: string, status: "CLOSED" | "ARCHIVED") {
    await this.mustExist(jobPostingId);
    void principal;
    const row = await this.prisma.jobPosting.update({
      where: { jobPostingId },
      data: { status },
      include: { audienceRules: { where: { deletedAt: null } } },
    });
    return toJob(row);
  }

  async remove(principal: Principal, jobPostingId: string): Promise<void> {
    await this.mustExist(jobPostingId);
    await this.prisma.jobPosting.update({
      where: { jobPostingId },
      data: { deletedAt: new Date(), deletedBy: principal.id },
    });
  }

  /** How many students a posting currently reaches. Computed, never stored. */
  async reachOf(jobPostingId: string): Promise<number> {
    const rules = await this.prisma.jobAudienceRule.findMany({
      where: { jobPostingId, deletedAt: null },
    });
    if (rules.length === 0) return 0;
    return this.prisma.student.count({ where: this.audienceWhere(rules) });
  }

  /** Preview reach for rules that have not been saved yet. */
  async previewReach(rules: CreateJobInput["audienceRules"]): Promise<number> {
    await this.assertAudienceValid(rules);
    if (rules.length === 0) return 0;
    return this.prisma.student.count({
      where: this.audienceWhere(
        rules.map((r) => ({
          courseId: r.courseId,
          batchId: r.batchId ?? null,
          collegeId: r.collegeId ?? null,
          cityId: r.cityId ?? null,
          passoutYear: r.passoutYear ?? null,
          segment: r.segment ?? null,
          completedOnly: r.completedOnly,
        })),
      ),
    });
  }

  /**
   * The audience predicate.
   *
   * Rules are OR-ed with each other and AND-ed within a rule. Course is the
   * primary axis and always present, so a student qualifies by being enrolled
   * in a batch of that course — narrowed by whichever of the other fields the
   * rule sets.
   */
  private audienceWhere(rules: AudienceRule[]): Prisma.StudentWhereInput {
    return {
      deletedAt: null,
      accountStatus: "ACTIVE",
      OR: rules.map((rule) => ({
        ...(rule.passoutYear !== null ? { passoutYear: rule.passoutYear } : {}),
        ...(rule.segment !== null ? { enrolmentChannel: rule.segment } : {}),
        ...(rule.collegeId !== null ? { collegeId: rule.collegeId } : {}),
        ...(rule.cityId !== null ? { cityId: rule.cityId } : {}),
        batchMappings: {
          some: {
            deletedAt: null,
            ...(rule.completedOnly ? { completedAt: { not: null } } : {}),
            batch: {
              deletedAt: null,
              courseId: rule.courseId,
              ...(rule.batchId !== null ? { batchId: rule.batchId } : {}),
            },
          },
        },
      })),
    };
  }

  private async assertAudienceValid(rules: { courseId: string }[]): Promise<void> {
    const courseIds = [...new Set(rules.map((r) => r.courseId))];
    if (courseIds.length === 0) return;
    const found = await this.prisma.course.count({
      where: { courseId: { in: courseIds }, deletedAt: null },
    });
    if (found !== courseIds.length) {
      throw ApiException.validation({ audienceRules: "One or more of those courses no longer exists" });
    }
  }

  private async mustExist(jobPostingId: string) {
    const row = await this.prisma.jobPosting.findFirst({ where: { jobPostingId, deletedAt: null } });
    if (!row) throw ApiException.notFound("Job posting");
    return row;
  }

  private toData(input: UpdateJobInput) {
    return {
      ...(input.roleTitle !== undefined ? { roleTitle: input.roleTitle } : {}),
      ...(input.companyName !== undefined ? { companyName: input.companyName } : {}),
      ...(input.location !== undefined ? { location: input.location || null } : {}),
      ...(input.workMode !== undefined ? { workMode: input.workMode } : {}),
      ...(input.experienceMinYears !== undefined ? { experienceMinYears: input.experienceMinYears } : {}),
      ...(input.experienceMaxYears !== undefined ? { experienceMaxYears: input.experienceMaxYears } : {}),
      ...(input.compensationMin !== undefined
        ? { compensationMinMinor: input.compensationMin ? this.parseMoney(input.compensationMin, "compensationMin") : null }
        : {}),
      ...(input.compensationMax !== undefined
        ? { compensationMaxMinor: input.compensationMax ? this.parseMoney(input.compensationMax, "compensationMax") : null }
        : {}),
      ...(input.compensationPeriod !== undefined ? { compensationPeriod: input.compensationPeriod || null } : {}),
      ...(input.skills !== undefined ? { skills: input.skills } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(input.applyUrl !== undefined ? { applyUrl: input.applyUrl || null } : {}),
      ...(input.applyEmail !== undefined ? { applyEmail: input.applyEmail || null } : {}),
      ...(input.closingDate !== undefined
        ? { closingDate: input.closingDate ? new Date(input.closingDate) : null }
        : {}),
    };
  }

  private parseMoney(value: string, field: string): bigint {
    try {
      const paise = parseRupees(value);
      if (paise < 0n) throw new Error("negative");
      return paise;
    } catch {
      throw ApiException.validation({ [field]: "Enter an amount like 450000" });
    }
  }
}

interface AudienceRule {
  courseId: string;
  batchId: string | null;
  collegeId: string | null;
  cityId: string | null;
  passoutYear: number | null;
  segment: "RETAIL" | "COLLEGE" | null;
  completedOnly: boolean;
}

type JobRow = Prisma.JobPostingGetPayload<{ include: { audienceRules: true } }>;

function toJob(row: JobRow): JobPosting {
  return {
    jobPostingId: row.jobPostingId,
    jobCode: row.jobCode,
    roleTitle: row.roleTitle,
    companyName: row.companyName,
    location: row.location,
    workMode: row.workMode,
    experienceMinYears: row.experienceMinYears,
    experienceMaxYears: row.experienceMaxYears,
    compensationMinMinor: row.compensationMinMinor?.toString() ?? null,
    compensationMaxMinor: row.compensationMaxMinor?.toString() ?? null,
    compensationPeriod: row.compensationPeriod,
    skills: row.skills,
    description: row.description,
    applyUrl: row.applyUrl,
    applyEmail: row.applyEmail,
    closingDate: row.closingDate?.toISOString().slice(0, 10) ?? null,
    status: row.status,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    audienceRules: row.audienceRules.map((r) => ({
      ruleId: r.ruleId,
      courseId: r.courseId,
      batchId: r.batchId,
      collegeId: r.collegeId,
      cityId: r.cityId,
      passoutYear: r.passoutYear,
      segment: r.segment,
      completedOnly: r.completedOnly,
    })),
  };
}
