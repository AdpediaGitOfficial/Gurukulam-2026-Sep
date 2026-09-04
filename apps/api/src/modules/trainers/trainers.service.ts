import { Injectable } from "@nestjs/common";
import { Prisma } from "@gurukulam/db";
import {
  parseRupees,
  type ApproveCoursesInput, type CreateTrainerInput, type Page, type Principal,
  type Trainer, type TrainerDetail, type TrainerQuery, type UpdateTrainerInput,
} from "@gurukulam/contracts";
import { PrismaService } from "../prisma/prisma.module";
import { IdService } from "../ids/id.service";
import { ApiException } from "../../common/errors";
import { withBusinessIdRetry } from "../../common/business-id-retry";
import { assertInScope, cityScope, liveOnly } from "../../common/scope/scope";
import { listPage, orderBy, paginate } from "../../common/scope/pagination";

const SORTABLE = ["name", "trainerCode", "createdAt", "experienceYears"] as const;

/**
 * What every mapped trainer needs.
 *
 * Live approvals only, in both the count and the ids: a revoked approval is
 * not one, and counting it made the detail page's tile disagree with the list
 * printed beneath it. Shared so the four places that map a trainer cannot
 * drift apart.
 */
const TRAINER_INCLUDE = {
  city: { select: { name: true } },
  courses: { where: { deletedAt: null }, select: { courseId: true } },
  _count: { select: { courses: { where: { deletedAt: null } } } },
} satisfies Prisma.TrainerInclude;


/**
 * Trainers, and the courses they are APPROVED for.
 *
 * Approval is a relationship rather than a skill tag, because free text cannot
 * answer "who may run this batch?" without a string match — and a batch's
 * trainer must be approved for that batch's course (invariant 15). The
 * `approvedForCourseId` filter is what the batch trainer picker calls.
 *
 * Trainers carry a city, so this module is city-scoped (invariant 11).
 */
@Injectable()
export class TrainersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdService,
  ) {}

  async list(principal: Principal, query: TrainerQuery): Promise<Page<Trainer>> {
    const where: Prisma.TrainerWhereInput = {
      ...liveOnly(query.includeDeleted),
      ...cityScope(principal),
      ...(query.cityId ? { cityId: query.cityId } : {}),
      ...(query.accountStatus ? { accountStatus: query.accountStatus } : {}),
      // Invariant 15's read side: only trainers with a live approval row.
      ...(query.approvedForCourseId
        ? { courses: { some: { courseId: query.approvedForCourseId, deletedAt: null } } }
        : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: "insensitive" } },
              { trainerCode: { contains: query.q, mode: "insensitive" } },
              { email: { contains: query.q, mode: "insensitive" } },
              { skillTags: { has: query.q } },
            ],
          }
        : {}),
    };

    return listPage(query, async () => {
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.trainer.findMany({
          where,
          orderBy: orderBy(query, SORTABLE, "name"),
          ...paginate(query),
          include: TRAINER_INCLUDE,
        }),
        this.prisma.trainer.count({ where }),
      ]);
      return [rows.map(toTrainer), total];
    });
  }

  async get(principal: Principal, trainerId: string): Promise<TrainerDetail> {
    const trainer = await this.prisma.trainer.findFirst({
      where: { trainerId, deletedAt: null },
      include: {
        ...TRAINER_INCLUDE,
        // The detail page names the courses, so this one carries them rather
        // than only their ids.
        courses: {
          where: { deletedAt: null },
          include: { course: { select: { courseId: true, courseCode: true, name: true } } },
        },
      },
    });
    if (!trainer) throw ApiException.notFound("Trainer");
    assertInScope(principal, trainer);

    return {
      ...toTrainer(trainer),
      approvedCourses: trainer.courses.map((c) => ({
        courseId: c.course.courseId,
        courseCode: c.course.courseCode,
        name: c.course.name,
        approvedAt: c.approvedAt?.toISOString() ?? null,
      })),
    };
  }

  async create(principal: Principal, input: CreateTrainerInput) {
    // A scoped operator cannot create a record outside their own region — it
    // would immediately vanish from their own list.
    if (input.cityId) assertInScope(principal, { cityId: input.cityId });
    else if (principal.cityScope !== null) {
      throw ApiException.validation({ cityId: "Select a city within your region" });
    }

    await this.assertEmailFree(input.email);

    return withBusinessIdRetry(async () => {
      const trainerCode = await this.ids.trainerCode();
      return this.prisma.$transaction(async (tx) => {
      const trainer = await tx.trainer.create({
        data: {
          trainerCode,
          name: input.name,
          email: input.email,
          phone: input.phone || null,
          qualification: input.qualification || null,
          experienceYears: input.experienceYears ?? null,
          skillTags: input.skillTags,
          payModel: input.payModel || null,
          payRateMinor: input.payRate ? this.parseMoney(input.payRate, "payRate") : null,
          maxWeeklyHours: input.maxWeeklyHours ?? null,
          cityId: input.cityId || null,
          createdBy: principal.id,
        },
        include: TRAINER_INCLUDE,
      });
        return toTrainer(trainer);
      });
    });
  }

  async update(principal: Principal, trainerId: string, input: UpdateTrainerInput) {
    const existing = await this.mustExist(principal, trainerId);
    if (input.cityId) assertInScope(principal, { cityId: input.cityId });
    if (input.email && input.email !== existing.email) await this.assertEmailFree(input.email);

    const trainer = await this.prisma.trainer.update({
      where: { trainerId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
        ...(input.qualification !== undefined ? { qualification: input.qualification || null } : {}),
        ...(input.experienceYears !== undefined ? { experienceYears: input.experienceYears } : {}),
        ...(input.skillTags !== undefined ? { skillTags: input.skillTags } : {}),
        ...(input.payModel !== undefined ? { payModel: input.payModel || null } : {}),
        ...(input.payRate !== undefined
          ? { payRateMinor: input.payRate ? this.parseMoney(input.payRate, "payRate") : null }
          : {}),
        ...(input.maxWeeklyHours !== undefined ? { maxWeeklyHours: input.maxWeeklyHours } : {}),
        ...(input.cityId !== undefined ? { cityId: input.cityId || null } : {}),
        ...(input.accountStatus !== undefined ? { accountStatus: input.accountStatus } : {}),
      },
      include: TRAINER_INCLUDE,
    });
    return toTrainer(trainer);
  }

  /**
   * Replaces the set of courses this trainer may run (invariant 15).
   *
   * Revoking an approval does NOT unassign the trainer from batches already
   * running that course — pulling a trainer off a live batch as a side effect
   * of a settings change would be worse than the inconsistency. The batch
   * service enforces approval at assignment time.
   */
  async approveCourses(principal: Principal, trainerId: string, input: ApproveCoursesInput) {
    await this.mustExist(principal, trainerId);

    const courseIds = [...new Set(input.courseIds)];
    if (courseIds.length > 0) {
      const found = await this.prisma.course.count({
        where: { courseId: { in: courseIds }, deletedAt: null },
      });
      if (found !== courseIds.length) {
        throw ApiException.validation({ courseIds: "One or more of those courses no longer exists" });
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.trainerCourse.findMany({ where: { trainerId, deletedAt: null } });
      const existingIds = new Set(existing.map((e) => e.courseId));
      const wanted = new Set(courseIds);

      const toRevoke = existing.filter((e) => !wanted.has(e.courseId));
      if (toRevoke.length > 0) {
        await tx.trainerCourse.updateMany({
          where: { trainerCourseId: { in: toRevoke.map((r) => r.trainerCourseId) } },
          data: { deletedAt: new Date(), deletedBy: principal.id },
        });
      }

      const toAdd = courseIds.filter((id) => !existingIds.has(id));
      for (const courseId of toAdd) {
        // Upsert-shaped: a previously revoked approval is revived rather than
        // duplicated, because the live-row unique index would refuse a second.
        const revoked = await tx.trainerCourse.findFirst({
          where: { trainerId, courseId, deletedAt: { not: null } },
        });
        if (revoked) {
          await tx.trainerCourse.update({
            where: { trainerCourseId: revoked.trainerCourseId },
            data: {
              deletedAt: null, deletedBy: null,
              approvedBy: principal.id, approvedAt: new Date(),
            },
          });
        } else {
          await tx.trainerCourse.create({
            data: {
              trainerId, courseId,
              approvedBy: principal.id, approvedAt: new Date(), createdBy: principal.id,
            },
          });
        }
      }

      const rows = await tx.trainerCourse.findMany({
        where: { trainerId, deletedAt: null },
        include: { course: { select: { courseId: true, courseCode: true, name: true } } },
      });
      return rows.map((r) => ({
        courseId: r.course.courseId,
        courseCode: r.course.courseCode,
        name: r.course.name,
        approvedAt: r.approvedAt?.toISOString() ?? null,
      }));
    });
  }

  async remove(principal: Principal, trainerId: string): Promise<void> {
    await this.mustExist(principal, trainerId);

    // A trainer confirmed on a live batch is committed delivery (invariant 9).
    // Removing them would leave the batch with a primary trainer who is not in
    // the directory.
    const committed = await this.prisma.batch.count({
      where: {
        primaryTrainerId: trainerId, deletedAt: null,
        status: { in: ["SCHEDULED", "IN_PROGRESS"] },
      },
    });
    if (committed > 0) {
      throw ApiException.conflict(
        `This trainer is confirmed on ${committed} scheduled or running batch${committed === 1 ? "" : "es"}. ` +
          "Reassign those first.",
      );
    }

    await this.prisma.trainer.update({
      where: { trainerId },
      data: { deletedAt: new Date(), deletedBy: principal.id },
    });
  }

  private async mustExist(principal: Principal, trainerId: string) {
    const trainer = await this.prisma.trainer.findFirst({ where: { trainerId, deletedAt: null } });
    if (!trainer) throw ApiException.notFound("Trainer");
    assertInScope(principal, trainer);
    return trainer;
  }

  private async assertEmailFree(email: string): Promise<void> {
    // The database has a partial unique index on live rows; checking here
    // turns a 500 into a field-keyed message the form can render.
    const clash = await this.prisma.trainer.findFirst({
      where: { email: { equals: email, mode: "insensitive" }, deletedAt: null },
      select: { trainerId: true },
    });
    if (clash) throw ApiException.conflict("That email is already in use", { email: "Already in use" });
  }

  private parseMoney(value: string, field: string): bigint {
    try {
      const paise = parseRupees(value);
      if (paise < 0n) throw new Error("negative");
      return paise;
    } catch {
      throw ApiException.validation({ [field]: "Enter an amount like 4500 or 4,500.00" });
    }
  }
}

type TrainerRow = Prisma.TrainerGetPayload<{ include: typeof TRAINER_INCLUDE }>;

function toTrainer(row: TrainerRow): Trainer {
  return {
    trainerId: row.trainerId,
    trainerCode: row.trainerCode,
    name: row.name,
    email: row.email,
    phone: row.phone,
    qualification: row.qualification,
    experienceYears: row.experienceYears,
    skillTags: row.skillTags,
    payModel: row.payModel,
    payRateMinor: row.payRateMinor?.toString() ?? null,
    maxWeeklyHours: row.maxWeeklyHours,
    cityId: row.cityId,
    cityName: row.city?.name ?? null,
    accountStatus: row.accountStatus,
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    approvedCourseCount: row._count.courses,
    approvedCourseIds: row.courses.map((c) => c.courseId),
  };
  // password_hash is deliberately absent. Mapping explicitly rather than
  // spreading the row is what keeps it that way when a column is added.
}
