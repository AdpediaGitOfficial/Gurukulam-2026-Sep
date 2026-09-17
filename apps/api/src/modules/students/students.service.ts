import { Injectable } from "@nestjs/common";
import { Prisma } from "@gurukulam/db";
import {
  parseRupees,
  type CreateStudentInput, type Page, type Principal, type Student,
  type StudentQuery, type SuspendStudentInput, type UnallocatedSummary,
  type UpdateStudentInput,
  type StudentDetail,
  type StudentImportInput, type StudentImportLine, type StudentImportResult,
  type StudentSummary,
} from "@gurukulam/contracts";
import { PrismaService } from "../prisma/prisma.module";
import { IdService } from "../ids/id.service";
import { ApiException } from "../../common/errors";
import { assertInScope, cityScope, collegeScope, inScope, liveOnly } from "../../common/scope/scope";
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
          orderBy: orderBy(query, SORTABLE, "createdAt", "studentId"),
          ...paginate(query),
          include: STUDENT_INCLUDE,
        }),
        this.prisma.student.count({ where }),
      ]);
      return [await this.decorate(rows.map(toStudent)), total];
    });
  }

  /**
   * Fills in the two columns a student row cannot answer by itself.
   *
   * Both are resolved ONCE PER PAGE rather than once per row: progress is a
   * property of the batch, so twenty-five students on one batch is one query,
   * and authors are looked up in two batched reads rather than fifty.
   */
  private async decorate(students: Student[]): Promise<Student[]> {
    const batchIds = [...new Set(students.map((s) => s.batchId).filter((b): b is string => Boolean(b)))];
    const adminIds = [...new Set(students.filter((s) => s.createdByType === "ADMIN_USER").map((s) => s.createdBy).filter((v): v is string => Boolean(v)))];
    const collegeUserIds = [...new Set(students.filter((s) => s.createdByType === "COLLEGE_USER").map((s) => s.createdBy).filter((v): v is string => Boolean(v)))];

    const [sessions, admins, collegeUsers] = await Promise.all([
      batchIds.length === 0 ? [] : this.prisma.batchSession.groupBy({
        by: ["batchId", "status"],
        where: { batchId: { in: batchIds }, deletedAt: null },
        _count: { _all: true },
      }),
      adminIds.length === 0 ? [] : this.prisma.adminUser.findMany({
        where: { adminUserId: { in: adminIds } }, select: { adminUserId: true, name: true },
      }),
      collegeUserIds.length === 0 ? [] : this.prisma.collegeUser.findMany({
        where: { collegeUserId: { in: collegeUserIds } },
        select: { collegeUserId: true, poc: { select: { name: true } } },
      }),
    ]);

    const progress = new Map<string, number>();
    for (const batchId of batchIds) {
      const mine = sessions.filter((g) => g.batchId === batchId);
      const total = mine.reduce((n, g) => n + g._count._all, 0);
      const done = mine.filter((g) => g.status === "COMPLETED").reduce((n, g) => n + g._count._all, 0);
      // A batch with nothing scheduled has no progress to report — 0% would
      // read as "behind" when the honest answer is "not started".
      if (total > 0) progress.set(batchId, Math.round((done / total) * 100));
    }
    const adminName = new Map(admins.map((a) => [a.adminUserId, a.name]));
    const collegeName = new Map(collegeUsers.map((u) => [u.collegeUserId, u.poc?.name ?? null]));

    return students.map((student) => ({
      ...student,
      progressPct: student.batchId === null || student.batchId === undefined
        ? null
        : progress.get(student.batchId) ?? null,
      createdByName:
        student.createdBy === null || student.createdBy === undefined
          ? null
          : adminName.get(student.createdBy) ?? collegeName.get(student.createdBy) ?? null,
    }));
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
        isActive: m.isActive,
        exitReason: m.exitReason,
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
  /**
   * The headline figures for the register's tiles.
   *
   * Scoped identically to `list`, and that is the whole contract: a tile that
   * counts something the table below it cannot show is a number nobody can
   * reconcile, and the operator ends up trusting neither.
   */
  async summary(principal: Principal): Promise<StudentSummary> {
    const scope = {
      ...liveOnly(),
      ...cityScope(principal),
      ...collegeScope(principal),
    } satisfies Prisma.StudentWhereInput;

    const [total, college, unallocated, colleges] = await this.prisma.$transaction([
      this.prisma.student.count({ where: scope }),
      // Segment is decided by the college link, not a stored flag — one fewer
      // thing that can disagree with itself (invariant 1).
      this.prisma.student.count({ where: { ...scope, collegeId: { not: null } } }),
      this.prisma.student.count({ where: { ...scope, batchMappings: { none: { deletedAt: null } } } }),
      this.prisma.student.findMany({
        where: { ...scope, collegeId: { not: null } },
        distinct: ["collegeId"],
        select: { collegeId: true },
      }),
    ]);

    return {
      total,
      retail: total - college,
      college,
      unallocated,
      collegesRepresented: colleges.length,
    };
  }

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


  /**
   * Bulk import — records only, never allocation.
   *
   * The plan is drawn against the database, reported in full, and committed as
   * ONE transaction. The two refusals worth knowing on sight:
   *
   *   · A row that would move an existing student to a different college. That
   *     changes who bills them (invariant 3) and which rosters they may join
   *     (invariant 2), so it is a deliberate act with its own screen, not a
   *     cell somebody retyped.
   *   · A row naming a college or city outside the caller's scope. Scope is
   *     applied here, inside the service (invariant 11) — a file is not a way
   *     around it.
   */
  async importStudents(
    principal: Principal,
    input: StudentImportInput,
  ): Promise<StudentImportResult> {
    /* A college portal user can only ever import into their OWN college, and
       the college detail screen pins one explicitly. Either way the file's own
       college_code column stops being consulted — see `pinnedCollegeId` below. */
    const pinnedCollegeId =
      principal.collegeScope !== null ? principal.collegeScope : (input.collegeId ?? null);

    let pinned: { collegeId: string; name: string; cityId: string; countryId: string } | null = null;
    if (pinnedCollegeId) {
      const found = await this.prisma.college.findFirst({
        where: { collegeId: pinnedCollegeId, deletedAt: null },
        select: { collegeId: true, name: true, cityId: true, countryId: true },
      });
      if (!found) throw ApiException.validation({ collegeId: "That college no longer exists" });
      assertInScope(principal, { cityId: found.cityId, collegeId: found.collegeId });
      pinned = found;
    }

    // Everything the file names, resolved in three reads rather than three per
    // row — a 500-row file should not be 1,500 round trips.
    const collegeCodes = pinned
      ? []
      : [...new Set(input.rows.map((r) => r.collegeCode?.toUpperCase()).filter((c): c is string => Boolean(c)))];
    const cityCodes = [...new Set(
      input.rows.map((r) => r.cityCode?.toUpperCase()).filter((c): c is string => Boolean(c)),
    )];
    const studentCodes = [...new Set(
      input.rows.map((r) => r.studentCode?.toUpperCase()).filter((c): c is string => Boolean(c)),
    )];
    const emails = [...new Set(input.rows.map((r) => r.email))];

    const [colleges, cities, byCodeRows, byEmailRows] = await Promise.all([
      collegeCodes.length === 0 ? [] : this.prisma.college.findMany({
        where: { collegeCode: { in: collegeCodes }, deletedAt: null },
        select: { collegeId: true, collegeCode: true, name: true, cityId: true, countryId: true },
      }),
      cityCodes.length === 0 ? [] : this.prisma.city.findMany({
        where: { cityCode: { in: cityCodes }, deletedAt: null },
        select: { cityId: true, cityCode: true, name: true, countryId: true },
      }),
      studentCodes.length === 0 ? [] : this.prisma.student.findMany({
        where: { studentCode: { in: studentCodes }, deletedAt: null },
        select: EXISTING_SELECT,
      }),
      emails.length === 0 ? [] : this.prisma.student.findMany({
        // Matched case-insensitively, exactly as the live unique index is —
        // otherwise a row typed Aarti.Rao@ would plan an ADD and then be
        // refused by the database at commit.
        where: { email: { in: emails, mode: "insensitive" }, deletedAt: null },
        select: EXISTING_SELECT,
      }),
    ]);

    /* Which columns the file carried — the difference between "not stated" and
       "blank". Normalised by the parser, so the service compares like with
       like rather than re-deriving a header it never saw. */
    const stated = new Set(input.columns);

    const collegesByCode = new Map(colleges.map((c) => [c.collegeCode.toUpperCase(), c]));
    const citiesByCode = new Map(cities.map((c) => [c.cityCode.toUpperCase(), c]));
    const existingByCode = new Map(byCodeRows.map((s) => [s.studentCode.toUpperCase(), s]));
    const existingByEmail = new Map(byEmailRows.map((s) => [s.email.toLowerCase(), s]));

    /* The colleges the matched students ALREADY belong to — needed so a plan
       row can name the institution it is leaving alone, not just the one the
       file mentions. */
    const targetCollegeIds = [...new Set(
      [...byCodeRows, ...byEmailRows].map((s) => s.collegeId).filter((id): id is string => Boolean(id)),
    )];
    const targetColleges = targetCollegeIds.length === 0 ? [] : await this.prisma.college.findMany({
      where: { collegeId: { in: targetCollegeIds } },
      select: { collegeId: true, name: true },
    });
    const collegeNameById = new Map(targetColleges.map((c) => [c.collegeId, c.name]));

    type Planned = {
      line: StudentImportLine;
      /** Present for an ADD; absent for everything else. */
      create?: Prisma.StudentUncheckedCreateInput;
      /** Present for an UPDATE. */
      update?: { studentId: string; data: Prisma.StudentUpdateInput };
    };

    const planned: Planned[] = [];

    for (const row of input.rows) {
      const name = [row.firstName, row.lastName].filter(Boolean).join(" ");
      const base = {
        rowNumber: row.rowNumber,
        studentId: null as string | null,
        studentCode: row.studentCode ?? null,
        name,
        email: row.email,
        segment: null as "RETAIL" | "COLLEGE" | null,
        collegeName: null as string | null,
      };
      const reject = (detail: string): Planned => ({ line: { ...base, outcome: "REJECT", detail } });

      // ── College. Blank is RETAIL, and that is a legitimate answer.
      let college = pinned;
      if (!pinned && row.collegeCode) {
        const found = collegesByCode.get(row.collegeCode.toUpperCase());
        if (!found) { planned.push(reject(`No college with code ${row.collegeCode}.`)); continue; }
        if (!inScope(principal, { cityId: found.cityId, collegeId: found.collegeId })) {
          planned.push(reject(`${found.name} is outside your scope.`));
          continue;
        }
        college = found;
      }

      // ── City. Named outright, or inherited from the college.
      let cityId: string | null = null;
      let countryId: string | null = null;
      if (row.cityCode) {
        const found = citiesByCode.get(row.cityCode.toUpperCase());
        if (!found) { planned.push(reject(`No city with code ${row.cityCode}.`)); continue; }
        if (!inScope(principal, { cityId: found.cityId })) {
          planned.push(reject(`${found.name} is outside your region.`));
          continue;
        }
        cityId = found.cityId;
        countryId = found.countryId;
      } else if (college) {
        cityId = college.cityId;
        countryId = college.countryId;
      } else if (principal.cityScope !== null) {
        // A regional sub-admin importing a retail student with no city would
        // otherwise create a record they cannot then see.
        planned.push(reject("Give a city_code — a retail student needs one within your region."));
        continue;
      }

      // ── Which student, if any, this row lands on.
      const target = row.studentCode
        ? existingByCode.get(row.studentCode.toUpperCase())
        : existingByEmail.get(row.email);

      /* The segment the student will be in AFTER this row, which for an update
         with no college column is the one they are in already. Reporting the
         row's own reading instead would print RETAIL beside a college student
         the import is not touching — a plan that lies about the one column
         everybody checks. */
      const landsUnder = college ?? (
        target?.collegeId
          ? { collegeId: target.collegeId, name: collegeNameById.get(target.collegeId) ?? "their college" }
          : null
      );
      const segment: "RETAIL" | "COLLEGE" = landsUnder ? "COLLEGE" : "RETAIL";
      const withSegment = { ...base, segment, collegeName: landsUnder?.name ?? null };

      if (row.studentCode && !target) {
        planned.push(reject(`No student with code ${row.studentCode}.`));
        continue;
      }

      if (target) {
        if (!inScope(principal, target)) {
          planned.push({
            line: { ...withSegment, outcome: "REJECT", studentId: null, studentCode: row.studentCode ?? null,
              detail: `${row.email} belongs to a record outside your scope.` },
          });
          continue;
        }
        // The refusal this whole method exists to make. Moving a student
        // between segments changes who bills them and which rosters they may
        // join; a spreadsheet is the wrong instrument for it.
        const targetCollegeId = target.collegeId ?? null;
        const rowCollegeId = college?.collegeId ?? null;
        /* A BLANK college_code means "not stated", not "make them retail" — so
           a file of contact corrections leaves everybody's segment alone. The
           refusal only fires when the row actually names a college, or the
           screen pinned one, and it disagrees with the record. */
        const namesACollege = pinned !== null || Boolean(row.collegeCode);
        if (namesACollege && targetCollegeId !== rowCollegeId) {
          planned.push({
            line: { ...withSegment, outcome: "REJECT", studentId: target.studentId, studentCode: target.studentCode,
              detail: targetCollegeId === null
                ? `${target.studentCode} is a retail student. Attaching them to a college changes who bills them — do it on their record.`
                : `${target.studentCode} already belongs to another college. Moving them changes who bills them — do it on their record.` },
          });
          continue;
        }
        // An email edit that collides with somebody else's record. The database
        // would refuse it at commit and take the whole transaction with it.
        if (target.email.toLowerCase() !== row.email) {
          const clash = existingByEmail.get(row.email);
          if (clash && clash.studentId !== target.studentId) {
            planned.push({
              line: { ...withSegment, outcome: "REJECT", studentId: target.studentId, studentCode: target.studentCode,
                detail: `${row.email} is already ${clash.studentCode}'s address.` },
            });
            continue;
          }
        }

        const changes: string[] = [];
        const data: Prisma.StudentUpdateInput = {};
        /**
         * Applies one field, IF the file carried its column.
         *
         * A column the header never mentioned is not an instruction to clear
         * the field — it is silence. Without this test a three-column file of
         * phone corrections erases every other thing known about forty people,
         * and the plan calls it an update.
         */
        const set = <K extends keyof Prisma.StudentUpdateInput>(
          label: string, column: string, current: unknown, next: unknown, key: K,
        ) => {
          if (!stated.has(column)) return;
          if (current === next) return;
          changes.push(label);
          (data as Record<string, unknown>)[key as string] = next;
        };

        set("first name", "first_name", target.firstName, row.firstName, "firstName");
        set("last name", "last_name", target.lastName ?? null, row.lastName ?? null, "lastName");
        set("email", "email", target.email, row.email, "email");
        set("phone", "phone", target.phone ?? null, row.phone ?? null, "phone");
        set("alternate phone", "alt_phone", target.altPhone ?? null, row.altPhone ?? null, "altPhone");
        set("date of birth", "date_of_birth", target.dateOfBirth ? isoDate(target.dateOfBirth) : null, row.dateOfBirth ?? null, "dateOfBirth");
        set("gender", "gender", target.gender ?? null, row.gender ?? null, "gender");
        set("address", "address_line1", target.addressLine1 ?? null, row.addressLine1 ?? null, "addressLine1");
        set("address", "address_line2", target.addressLine2 ?? null, row.addressLine2 ?? null, "addressLine2");
        set("postal code", "postal_code", target.postalCode ?? null, row.postalCode ?? null, "postalCode");
        set("discipline", "discipline", target.discipline ?? null, row.discipline ?? null, "discipline");
        set("passout year", "passout_year", target.passoutYear ?? null, row.passoutYear ?? null, "passoutYear");
        set("qualification", "qualification", target.qualification ?? null, row.qualification ?? null, "qualification");
        set("notes", "notes", target.notes ?? null, row.notes ?? null, "notes");
        // City moves are ordinary — a student relocating is not a segment change.
        if (cityId !== null && cityId !== target.cityId) {
          changes.push("city");
          data.city = { connect: { cityId } };
          if (countryId) data.country = { connect: { countryId } };
        }
        // A date has to become a Date after the string comparison above.
        if (data.dateOfBirth !== undefined) {
          data.dateOfBirth = row.dateOfBirth ? new Date(`${row.dateOfBirth}T00:00:00Z`) : null;
        }

        planned.push(changes.length === 0
          ? { line: { ...withSegment, outcome: "UNCHANGED", studentId: target.studentId, studentCode: target.studentCode, detail: "Already exactly this." } }
          : {
              line: { ...withSegment, outcome: "UPDATE", studentId: target.studentId, studentCode: target.studentCode,
                detail: `Changes ${[...new Set(changes)].join(", ")}.` },
              update: { studentId: target.studentId, data },
            });
        continue;
      }

      planned.push({
        line: { ...withSegment, outcome: "ADD", studentId: null, studentCode: null, detail: null },
        create: {
          // Filled in inside the transaction — a business ID is generated on
          // save and never earlier (invariant 9).
          studentCode: "",
          firstName: row.firstName,
          lastName: row.lastName || null,
          email: row.email,
          phone: row.phone || null,
          altPhone: row.altPhone || null,
          dateOfBirth: row.dateOfBirth ? new Date(`${row.dateOfBirth}T00:00:00Z`) : null,
          gender: row.gender || null,
          collegeId: college?.collegeId ?? null,
          // Explicit, never inferred from collegeId being null.
          enrolmentChannel: segment,
          createdByCollegeId: principal.collegeScope !== null ? principal.collegeScope : null,
          createdByType: principal.actor === "COLLEGE_USER" ? "COLLEGE_USER" : "ADMIN_USER",
          createdBy: principal.id,
          countryId,
          cityId,
          addressLine1: row.addressLine1 || null,
          addressLine2: row.addressLine2 || null,
          postalCode: row.postalCode || null,
          discipline: row.discipline || null,
          passoutYear: row.passoutYear ?? null,
          qualification: row.qualification || null,
          notes: row.notes || null,
        },
      });
    }

    const count = (outcome: StudentImportLine["outcome"]) =>
      planned.filter((p) => p.line.outcome === outcome).length;
    const rejected = count("REJECT");

    const result = (committed: boolean): StudentImportResult => ({
      committed,
      added: count("ADD"),
      updated: count("UPDATE"),
      unchanged: count("UNCHANGED"),
      rejected,
      // Every added student is unallocated, by construction — this import does
      // not allocate. Stated rather than implied: "I imported 40 and nothing
      // happened" is the support call this number answers.
      unallocated: count("ADD"),
      lines: planned.map((p) => p.line),
    });

    // A dry run, or anything refused, writes nothing. Both come back as a plan
    // the operator reads before committing.
    if (input.dryRun || rejected > 0) return result(false);

    const toCreate = planned.filter((p) => p.create !== undefined);
    const toUpdate = planned.filter((p) => p.update !== undefined);

    /* Codes are generated inside the transaction and can lose a race with a
       concurrent onboarding. The retry re-runs the whole block, which is safe
       because every update sets fixed values and every create is keyed on an
       email the plan proved free — replaying either lands in the same place. */
    await withBusinessIdRetry(() =>
      this.prisma.$transaction(async (tx) => {
        for (const item of toUpdate) {
          const update = item.update;
          if (!update) continue;
          await tx.student.update({ where: { studentId: update.studentId }, data: update.data });
        }
        for (const item of toCreate) {
          const create = item.create;
          if (!create) continue;
          const student = await tx.student.create({
            data: { ...create, studentCode: await this.ids.studentCode() },
            select: { studentId: true, studentCode: true },
          });
          item.line.studentId = student.studentId;
          item.line.studentCode = student.studentCode;
        }
      }),
    );

    return result(true);
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
  // The live mapping, for the batch column. One row: a student sits on one
  // batch at a time, and the count above is what reports otherwise.
  batchMappings: {
    where: { deletedAt: null },
    take: 1,
    orderBy: { createdAt: "desc" },
    select: { batchId: true, batch: { select: { batchCode: true } } },
  },
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
    altPhone: row.altPhone,
    dateOfBirth: row.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    gender: row.gender,
    collegeId: row.collegeId,
    collegeName: row.college?.name ?? null,
    enrolmentChannel: row.enrolmentChannel,
    countryId: row.countryId,
    cityId: row.cityId,
    cityName: row.city?.name ?? null,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    postalCode: row.postalCode,
    discipline: row.discipline,
    passoutYear: row.passoutYear,
    qualification: row.qualification,
    notes: row.notes,
    accountStatus: row.accountStatus,
    suspendedAt: row.suspendedAt?.toISOString() ?? null,
    suspendedReason: row.suspendedReason,
    credentialsIssuedAt: row.credentialsIssuedAt?.toISOString() ?? null,
    batchId: row.batchMappings[0]?.batchId ?? null,
    batchCode: row.batchMappings[0]?.batch?.batchCode ?? null,
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

/**
 * What the import needs to know about a student already on file.
 *
 * Declared once and used for BOTH lookups — by code and by email — so the two
 * maps hold the same shape and a field added for one is never missing from the
 * other.
 */
const EXISTING_SELECT = {
  studentId: true, studentCode: true, firstName: true, lastName: true, email: true,
  phone: true, altPhone: true, dateOfBirth: true, gender: true,
  collegeId: true, cityId: true, addressLine1: true, addressLine2: true, postalCode: true,
  discipline: true, passoutYear: true, qualification: true, notes: true,
} satisfies Prisma.StudentSelect;

/** A stored date as the file writes it, for comparing like with like. */
const isoDate = (value: Date): string => value.toISOString().slice(0, 10);
