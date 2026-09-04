import { Injectable } from "@nestjs/common";
import { Prisma } from "@gurukulam/db";
import {
  parseRupees,
  type Course,
  type CourseQuery,
  type CreateCourseInput,
  type Page,
  type Principal,
  type ReplaceTopicsInput,
  type UpdateCourseInput,
  type CourseDetail,
} from "@gurukulam/contracts";
import { PrismaService } from "../prisma/prisma.module";
import { IdService } from "../ids/id.service";
import { ApiException } from "../../common/errors";
import { withBusinessIdRetry } from "../../common/business-id-retry";
import { liveOnly } from "../../common/scope/scope";
import { listPage, orderBy, paginate } from "../../common/scope/pagination";

const SORTABLE = ["name", "courseCode", "createdAt", "standardMarketValueMinor"] as const;

/**
 * The catalogue.
 *
 * A course carries no city or college, so it is not scoped — it is the same
 * catalogue everywhere. Every other module here scopes; this one is the
 * deliberate exception, stated so its absence does not read as an oversight.
 */
@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdService,
  ) {}

  async list(_principal: Principal, query: CourseQuery): Promise<Page<Course>> {
    const where: Prisma.CourseWhereInput = {
      ...liveOnly(query.includeDeleted),
      ...(query.category ? { category: query.category } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: "insensitive" } },
              { courseCode: { contains: query.q, mode: "insensitive" } },
              { category: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    return listPage(query, async () => {
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.course.findMany({
          where,
          orderBy: orderBy(query, SORTABLE, "name"),
          ...paginate(query),
          include: {
            _count: { select: { topics: true, batches: true, trainerCourses: true } },
          },
        }),
        this.prisma.course.count({ where }),
      ]);
      return [rows.map(toCourse), total];
    });
  }

  async get(_principal: Principal, courseId: string): Promise<CourseDetail> {
    const course = await this.prisma.course.findFirst({
      where: { courseId, deletedAt: null },
      include: {
        topics: { where: { deletedAt: null }, orderBy: { sequence: "asc" } },
        _count: { select: { topics: true, batches: true, trainerCourses: true } },
      },
    });
    if (!course) throw ApiException.notFound("Course");

    return {
      ...toCourse(course),
      topics: course.topics.map((t) => ({
        topicId: t.topicId,
        courseId: t.courseId,
        title: t.title,
        description: t.description,
        sequence: t.sequence,
        durationHours: t.durationHours,
      })),
    };
  }

  async create(principal: Principal, input: CreateCourseInput) {
    const standardMarketValueMinor = this.parseMoney(input.standardMarketValue, "standardMarketValue");

    return withBusinessIdRetry(async () => {
      // Allocated OUTSIDE the transaction — see batches.service.ts.
      const courseCode = await this.ids.courseCode(input.name);
      return this.prisma.$transaction(async (tx) => {

      const course = await tx.course.create({
        data: {
          courseCode,
          name: input.name,
          shortName: input.shortName || null,
          description: input.description || null,
          category: input.category || null,
          durationHours: input.durationHours ?? null,
          durationWeeks: input.durationWeeks ?? null,
          standardMarketValueMinor,
          syllabusUrl: input.syllabusUrl || null,
          attendanceFloorPct: input.attendanceFloorPct ?? null,
          createdBy: principal.id,
          topics: {
            create: input.topics.map((t, i) => ({
              title: t.title,
              description: t.description || null,
              // Sequence comes from array order — the console reorders by
              // dragging, and an operator-typed number collides.
              sequence: i + 1,
              durationHours: t.durationHours ?? null,
              createdBy: principal.id,
            })),
          },
        },
        include: { topics: { orderBy: { sequence: "asc" } }, _count: { select: { topics: true, batches: true, trainerCourses: true } } },
      });

        return toCourse(course);
      });
    });
  }

  async update(principal: Principal, courseId: string, input: UpdateCourseInput) {
    await this.mustExist(courseId);

    const data: Prisma.CourseUpdateInput = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.shortName !== undefined ? { shortName: input.shortName || null } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(input.category !== undefined ? { category: input.category || null } : {}),
      ...(input.durationHours !== undefined ? { durationHours: input.durationHours } : {}),
      ...(input.durationWeeks !== undefined ? { durationWeeks: input.durationWeeks } : {}),
      ...(input.syllabusUrl !== undefined ? { syllabusUrl: input.syllabusUrl || null } : {}),
      ...(input.attendanceFloorPct !== undefined ? { attendanceFloorPct: input.attendanceFloorPct } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.standardMarketValue !== undefined
        ? { standardMarketValueMinor: this.parseMoney(input.standardMarketValue, "standardMarketValue") }
        : {}),
    };
    // courseCode is deliberately absent: a business ID is immutable once
    // issued, because every batch, ledger and report points at it.

    const course = await this.prisma.course.update({
      where: { courseId },
      data,
      include: { _count: { select: { topics: true, batches: true, trainerCourses: true } } },
    });
    void principal;
    return toCourse(course);
  }

  /** Topics are replaced wholesale — the console edits the list, not a row. */
  async replaceTopics(principal: Principal, courseId: string, input: ReplaceTopicsInput) {
    await this.mustExist(courseId);

    return this.prisma.$transaction(async (tx) => {
      // Soft-deleted rather than removed: a session points at its topic, and
      // erasing the row would orphan the delivered history.
      await tx.courseTopic.updateMany({
        where: { courseId, deletedAt: null },
        data: { deletedAt: new Date(), deletedBy: principal.id },
      });

      await tx.courseTopic.createMany({
        data: input.topics.map((t, i) => ({
          courseId,
          title: t.title,
          description: t.description || null,
          sequence: i + 1,
          durationHours: t.durationHours ?? null,
          createdBy: principal.id,
        })),
      });

      const topics = await tx.courseTopic.findMany({
        where: { courseId, deletedAt: null },
        orderBy: { sequence: "asc" },
      });
      return topics;
    });
  }

  /**
   * Soft delete (ADR 0002). Refused while live batches still run the course —
   * removing it would leave those batches pointing at a course the catalogue
   * no longer lists.
   */
  async remove(principal: Principal, courseId: string): Promise<void> {
    await this.mustExist(courseId);

    const liveBatches = await this.prisma.batch.count({
      where: { courseId, deletedAt: null, status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
    });
    if (liveBatches > 0) {
      throw ApiException.conflict(
        `This course has ${liveBatches} scheduled or running batch${liveBatches === 1 ? "" : "es"}. ` +
          "Complete or cancel them first.",
      );
    }

    await this.prisma.course.update({
      where: { courseId },
      data: { deletedAt: new Date(), deletedBy: principal.id },
    });
  }

  private async mustExist(courseId: string): Promise<void> {
    const found = await this.prisma.course.findFirst({
      where: { courseId, deletedAt: null },
      select: { courseId: true },
    });
    if (!found) throw ApiException.notFound("Course");
  }

  /** Operator-typed rupees → paise, with the failure keyed to its field. */
  private parseMoney(value: string, field: string): bigint {
    try {
      const paise = parseRupees(value);
      if (paise < 0n) throw new Error("negative");
      return paise;
    } catch {
      throw ApiException.validation({ [field]: "Enter an amount like 45000 or 45,000.00" });
    }
  }
}

type CourseRow = Prisma.CourseGetPayload<{
  include: { _count: { select: { topics: true; batches: true; trainerCourses: true } } };
}>;

/**
 * Maps a row to the wire contract. Explicit rather than spreading the record,
 * so adding a column to the schema never silently publishes it — password
 * hashes and internal flags leak exactly this way.
 */
function toCourse(row: CourseRow): Course {
  return {
    courseId: row.courseId,
    courseCode: row.courseCode,
    name: row.name,
    shortName: row.shortName,
    description: row.description,
    category: row.category,
    durationHours: row.durationHours,
    durationWeeks: row.durationWeeks,
    standardMarketValueMinor: row.standardMarketValueMinor.toString(),
    syllabusUrl: row.syllabusUrl,
    attendanceFloorPct: row.attendanceFloorPct,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    topicCount: row._count.topics,
    batchCount: row._count.batches,
    approvedTrainerCount: row._count.trainerCourses,
  };
}
