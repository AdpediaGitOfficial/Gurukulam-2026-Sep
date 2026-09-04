import { Injectable } from "@nestjs/common";
import { Prisma } from "@gurukulam/db";
import {
  parseRupees,
  type CreateStudentInput, type Page, type Principal, type Student,
  type StudentQuery, type SuspendStudentInput, type UnallocatedSummary,
  type UpdateStudentInput,
  type StudentDetail,
} from "@gurukulam/contracts";
import { PrismaService } from "../prisma/prisma.module";
import { IdService } from "../ids/id.service";
import { ApiException } from "../../common/errors";
import { assertInScope, cityScope, collegeScope, liveOnly } from "../../common/scope/scope";
import { listPage, orderBy, paginate } from "../../common/scope/pagination";
import { withBusinessIdRetry } from "../../common/business-id-retry";

const SORTABLE = ["createdAt", "firstName", "studentCode", "passoutYear"] as const;

/**
 * The student register — retail and college in one table.
 *
 * Onboarding creates the record and nothing else. Course, batch, price,
 * schedule and credentials are all decided at ALLOCATION, which is the
 * five-step transaction in `allocation.service.ts`.
 */
@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdService,
  ) {}

  async list(principal: Principal, query: StudentQuery): Promise<Page<Student>> {
    const where: Prisma.StudentWhereInput = {
      ...liveOnly(query.includeDeleted),
      ...cityScope(principal),
      ...collegeScope(principal),
      ...(query.collegeId ? { collegeId: query.collegeId } : {}),
      ...(query.cityId ? { cityId: query.cityId } : {}),
      ...(query.segment ? { enrolmentChannel: query.segment } : {}),
      ...(query.accountStatus ? { accountStatus: query.accountStatus } : {}),
      ...(query.batchId
        ? { batchMappings: { some: { batchId: query.batchId, deletedAt: null } } }
        : {}),
      ...(query.courseId
        ? { batchMappings: { some: { deletedAt: null, batch: { courseId: query.courseId, deletedAt: null } } } }
        : {}),
      // The unallocated queue: no LIVE roster row. `some/none` rather than a
      // stored flag, so it cannot go stale when a mapping is removed.
      ...(query.allocated === true ? { batchMappings: { some: { deletedAt: null } } } : {}),
      ...(query.allocated === false ? { batchMappings: { none: { deletedAt: null } } } : {}),
      ...(query.q
        ? {
            OR: [
              { firstName: { contains: query.q, mode: "insensitive" } },
              { lastName: { contains: query.q, mode: "insensitive" } },
              { studentCode: { contains: query.q, mode: "insensitive" } },
              { email: { contains: query.q, mode: "insensitive" } },
              { phone: { contains: query.q } },
            ],
          }
        : {}),
    };

    return listPage(query, async () => {
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.student.findMany({
          where,
          orderBy: orderBy(query, SORTABLE, "createdAt"),
          ...paginate(query),
          include: STUDENT_INCLUDE,
        }),
        this.prisma.student.count({ where }),
      ]);
      return [rows.map(toStudent), total];
    });
  }

  async get(principal: Principal, studentId: string): Promise<StudentDetail> {
    const student = await this.prisma.student.findFirst({
      where: { studentId, deletedAt: null },
      include: {
        ...STUDENT_INCLUDE,
        batchMappings: {
          where: { deletedAt: null },
          include: {
            batch: {
              select: {
                batchId: true, batchCode: true, name: true, status: true,
                collegeId: true, course: { select: { courseId: true, name: true } },
              },
            },
          },
        },
        ledgers: {
          where: { deletedAt: null },
          include: { _count: { select: { installments: { where: { deletedAt: null } } } } },
        },
      },
    });
    if (!student) throw ApiException.notFound("Student");
    assertInScope(principal, student);

    return {
      ...toStudent(student),
      batches: student.batchMappings.map((m) => ({
        batchId: m.batch.batchId,
        batchCode: m.batch.batchCode,
        name: m.batch.name,
        status: m.batch.status,
        segment: m.batch.collegeId === null ? "RETAIL" : "COLLEGE",
        courseId: m.batch.course.courseId,
        courseName: m.batch.course.name,
        enrolledAt: m.enrolledAt.toISOString(),
        completedAt: m.completedAt?.toISOString() ?? null,
      })),
      // A college student has none of these by design (invariant 3).
      ledgers: student.ledgers.map((l) => ({
        ledgerId: l.ledgerId,
        courseId: l.courseId,
        courseValueMinor: l.courseValueMinor.toString(),
        enrolmentValueMinor: l.enrolmentValueMinor.toString(),
        discountAmountMinor: l.discountAmountMinor?.toString() ?? null,
        totalPaidMinor: l.totalPaidMinor.toString(),
        balancePendingMinor: l.balancePendingMinor.toString(),
        status: l.status,
        installmentCount: l._count.installments,
      })),
    };
  }

  async create(principal: Principal, input: CreateStudentInput) {
    // A college portal user can only ever onboard into their OWN college —
    // that is what makes institutional intake auditable rather than a way in.
    const collegeId =
      principal.collegeScope !== null ? principal.collegeScope : (input.collegeId ?? null);

    let cityId = input.cityId ?? null;
    let countryId = input.countryId ?? null;

    if (collegeId) {
      const college = await this.prisma.college.findFirst({
        where: { collegeId, deletedAt: null },
        select: { collegeId: true, cityId: true, countryId: true },
      });
      if (!college) throw ApiException.validation({ collegeId: "That college no longer exists" });
      assertInScope(principal, { cityId: college.cityId, collegeId: college.collegeId });
      // Derived from the college when not supplied; captured directly for a
      // retail walk-in. Needed either way.
      cityId ??= college.cityId;
      countryId ??= college.countryId;
    } else {
      if (cityId) assertInScope(principal, { cityId });
      else if (principal.cityScope !== null) {
        throw ApiException.validation({ cityId: "Select a city within your region" });
      }
    }

    await this.assertEmailFree(input.email);

    return withBusinessIdRetry(async () => {
      const studentCode = await this.ids.studentCode();
      const student = await this.prisma.student.create({
        data: {
          studentCode,
          firstName: input.firstName,
          lastName: input.lastName || null,
          email: input.email,
          phone: input.phone || null,
          altPhone: input.altPhone || null,
          dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
          gender: input.gender || null,
          collegeId,
          // Explicit, never inferred from collegeId being null.
          enrolmentChannel: collegeId ? "COLLEGE" : "RETAIL",
          createdByCollegeId: principal.collegeScope !== null ? principal.collegeScope : null,
          createdByType: principal.actor === "COLLEGE_USER" ? "COLLEGE_USER" : "ADMIN_USER",
          createdBy: principal.id,
          countryId,
          cityId,
          addressLine1: input.addressLine1 || null,
          addressLine2: input.addressLine2 || null,
          postalCode: input.postalCode || null,
          discipline: input.discipline || null,
          passoutYear: input.passoutYear ?? null,
          qualification: input.qualification || null,
          notes: input.notes || null,
        },
        include: STUDENT_INCLUDE,
      });
      return toStudent(student);
    });
  }

  async update(principal: Principal, studentId: string, input: UpdateStudentInput) {
    const existing = await this.mustExist(principal, studentId);
    if (input.email && input.email !== existing.email) await this.assertEmailFree(input.email);
    if (input.cityId) assertInScope(principal, { cityId: input.cityId });

    const student = await this.prisma.student.update({
      where: { studentId },
      data: {
        ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName || null } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
        ...(input.altPhone !== undefined ? { altPhone: input.altPhone || null } : {}),
        ...(input.dateOfBirth !== undefined
          ? { dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null }
          : {}),
        ...(input.gender !== undefined ? { gender: input.gender || null } : {}),
        ...(input.countryId !== undefined ? { countryId: input.countryId || null } : {}),
        ...(input.cityId !== undefined ? { cityId: input.cityId || null } : {}),
        ...(input.addressLine1 !== undefined ? { addressLine1: input.addressLine1 || null } : {}),
        ...(input.addressLine2 !== undefined ? { addressLine2: input.addressLine2 || null } : {}),
        ...(input.postalCode !== undefined ? { postalCode: input.postalCode || null } : {}),
        ...(input.discipline !== undefined ? { discipline: input.discipline || null } : {}),
        ...(input.passoutYear !== undefined ? { passoutYear: input.passoutYear } : {}),
        ...(input.qualification !== undefined ? { qualification: input.qualification || null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      },
      include: STUDENT_INCLUDE,
    });
    return toStudent(student);
    // collegeId is absent: moving a student between segments would strand
    // their ledger or their institution's contract seat.
  }

  /** Suspends access without touching enrolment, billing or history. */
  async suspend(principal: Principal, studentId: string, input: SuspendStudentInput) {
    await this.mustExist(principal, studentId);
    const student = await this.prisma.student.update({
      where: { studentId },
      data: {
        accountStatus: "SUSPENDED",
        suspendedAt: new Date(),
        suspendedReason: input.reason,
      },
      include: STUDENT_INCLUDE,
    });
    return toStudent(student);
  }

  async reinstate(principal: Principal, studentId: string) {
    await this.mustExist(principal, studentId);
    const student = await this.prisma.student.update({
      where: { studentId },
      data: { accountStatus: "ACTIVE", suspendedAt: null, suspendedReason: null },
      include: STUDENT_INCLUDE,
    });
    return toStudent(student);
  }

  async remove(principal: Principal, studentId: string): Promise<void> {
    await this.mustExist(principal, studentId);

    // Money already received is a fact about when it was received. Removing
    // the student it belongs to would leave the collection register unable to
    // reconcile (ADR 0002 is why the row survives, but an operator should not
    // reach this state by accident).
    const paid = await this.prisma.paymentTransaction.count({
      where: { deletedAt: null, installment: { ledger: { studentId, deletedAt: null } } },
    });
    if (paid > 0) {
      throw ApiException.conflict(
        `This student has ${paid} recorded payment${paid === 1 ? "" : "s"}. ` +
          "Suspend the account instead — a receipt is a financial record.",
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.studentBatchMapping.updateMany({
        where: { studentId, deletedAt: null },
        data: { deletedAt: now, deletedBy: principal.id },
      });
      await tx.student.update({
        where: { studentId },
        data: { deletedAt: now, deletedBy: principal.id },
      });
    });
  }

  /**
   * The gap between a record existing and revenue starting, plus the three
   * sibling queues that catch a half-finished allocation.
   *
   * Every count is a live query rather than a stored figure — a stored one
   * goes stale the moment a mapping or an installment changes.
   */
  async unallocatedSummary(principal: Principal): Promise<UnallocatedSummary> {
    const scope = {
      ...liveOnly(),
      ...cityScope(principal),
      ...collegeScope(principal),
    } satisfies Prisma.StudentWhereInput;

    const unallocatedWhere: Prisma.StudentWhereInput = {
      ...scope,
      batchMappings: { none: { deletedAt: null } },
    };

    const now = Date.now();
    const daysAgo = (n: number) => new Date(now - n * 86_400_000);

    const [total, d0to3, d4to7, d8to14, d15plus, noLedger, noInstallments, credentialsUnused] =
      await this.prisma.$transaction([
        this.prisma.student.count({ where: unallocatedWhere }),
        this.prisma.student.count({ where: { ...unallocatedWhere, createdAt: { gte: daysAgo(3) } } }),
        this.prisma.student.count({
          where: { ...unallocatedWhere, createdAt: { lt: daysAgo(3), gte: daysAgo(7) } },
        }),
        this.prisma.student.count({
          where: { ...unallocatedWhere, createdAt: { lt: daysAgo(7), gte: daysAgo(14) } },
        }),
        this.prisma.student.count({ where: { ...unallocatedWhere, createdAt: { lt: daysAgo(14) } } }),
        // Retail only: a college student having no ledger is correct, not a
        // defect (invariant 3).
        this.prisma.student.count({
          where: {
            ...scope,
            enrolmentChannel: "RETAIL",
            batchMappings: { some: { deletedAt: null } },
            ledgers: { none: { deletedAt: null } },
          },
        }),
        this.prisma.student.count({
          where: {
            ...scope,
            ledgers: { some: { deletedAt: null, installments: { none: { deletedAt: null } } } },
          },
        }),
        this.prisma.student.count({
          where: { ...scope, credentialsIssuedAt: { not: null }, lastLoginAt: null },
        }),
      ]);

    return {
      unallocated: { total, buckets: { d0to3, d4to7, d8to14, d15plus } },
      noLedger,
      noInstallments,
      credentialsUnused,
    };
  }

  private async mustExist(principal: Principal, studentId: string) {
    const student = await this.prisma.student.findFirst({ where: { studentId, deletedAt: null } });
    if (!student) throw ApiException.notFound("Student");
    assertInScope(principal, student);
    return student;
  }

  private async assertEmailFree(email: string): Promise<void> {
    const clash = await this.prisma.student.findFirst({
      where: { email: { equals: email, mode: "insensitive" }, deletedAt: null },
      select: { studentId: true },
    });
    if (clash) throw ApiException.conflict("That email is already in use", { email: "Already in use" });
  }
}

const STUDENT_INCLUDE = {
  college: { select: { name: true } },
  city: { select: { name: true } },
  _count: { select: { batchMappings: { where: { deletedAt: null } } } },
} satisfies Prisma.StudentInclude;

type StudentRow = Prisma.StudentGetPayload<{ include: typeof STUDENT_INCLUDE }>;

export function toStudent(row: StudentRow): Student {
  return {
    studentId: row.studentId,
    studentCode: row.studentCode,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    dateOfBirth: row.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    gender: row.gender,
    collegeId: row.collegeId,
    collegeName: row.college?.name ?? null,
    enrolmentChannel: row.enrolmentChannel,
    countryId: row.countryId,
    cityId: row.cityId,
    cityName: row.city?.name ?? null,
    discipline: row.discipline,
    passoutYear: row.passoutYear,
    qualification: row.qualification,
    accountStatus: row.accountStatus,
    suspendedReason: row.suspendedReason,
    credentialsIssuedAt: row.credentialsIssuedAt?.toISOString() ?? null,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdBy: row.createdBy,
    createdByType: row.createdByType,
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    batchCount: row._count.batchMappings,
    isAllocated: row._count.batchMappings > 0,
  };
  // password_hash is deliberately absent.
}

/** Operator-typed rupees → paise, with the failure keyed to its field. */
export function parseMoneyField(value: string, field: string): bigint {
  try {
    const paise = parseRupees(value);
    if (paise < 0n) throw new Error("negative");
    return paise;
  } catch {
    throw ApiException.validation({ [field]: "Enter an amount like 40000 or 40,000.00" });
  }
}
