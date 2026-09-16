import { Injectable } from "@nestjs/common";
import { Prisma } from "@gurukulam/db";
import type { Dashboard, Principal, SegmentedCount, SegmentedMoney } from "@gurukulam/contracts";
import { PrismaService } from "../prisma/prisma.module";
import { cityScope, collegeScope, liveOnly } from "../../common/scope/scope";

/**
 * The executive dashboard.
 *
 * Two things make this module different from every other one, and both are
 * about how easy it is to get quietly wrong:
 *
 * 1. **Scope is applied to every aggregate, individually.** A dashboard is the
 *    easiest place to leak another region's data because it feels like "just
 *    numbers" — there is no record on screen to look wrong. `architecture.md`
 *    §7 is explicit that a cached figure must be scope-derived or one region's
 *    numbers appear in another's. Nothing here is cached, and the scope the
 *    figures were computed under is echoed back in the response so a total can
 *    never be mistaken for a global one.
 *
 * 2. **Everything is segmented retail vs college.** The two have different
 *    economics, and a blended number hides both.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async build(principal: Principal): Promise<Dashboard> {
    // Computed once, from the principal, and threaded into every query below.
    // A helper that quietly returned {} for an unrecognised actor would make
    // every figure global, so each fragment is derived explicitly.
    const studentScope: Prisma.StudentWhereInput = {
      ...liveOnly(),
      ...cityScope(principal),
      ...collegeScope(principal),
    };
    const batchScope: Prisma.BatchWhereInput = {
      ...liveOnly(),
      ...cityScope(principal),
      ...collegeScope(principal),
    };
    const collegeWhere: Prisma.CollegeWhereInput = {
      ...liveOnly(),
      ...cityScope(principal),
      ...collegeScope(principal, "collegeId"),
    };

    const [headline, actions, collections, trend, delivery, topCourses, trainerLoad] =
      await Promise.all([
        this.headline(principal, studentScope, collegeWhere),
        this.actions(principal, studentScope, batchScope, collegeWhere),
        this.collections(principal, studentScope, collegeWhere),
        this.trend(principal, studentScope, collegeWhere),
        this.delivery(batchScope, studentScope),
        this.topCourses(batchScope, studentScope),
        this.trainerLoad(principal),
      ]);

    return {
      headline,
      actions,
      collections,
      trend,
      delivery,
      topCourses,
      trainerLoad,
      scope: {
        cityIds: principal.cityScope,
        collegeId: principal.collegeScope,
        label: describeScope(principal),
      },
      generatedAt: new Date().toISOString(),
    };
  }

  private async headline(
    principal: Principal,
    studentScope: Prisma.StudentWhereInput,
    collegeWhere: Prisma.CollegeWhereInput,
  ) {
    const [retail, college, trainers, colleges, questionBank] = await Promise.all([
      this.prisma.student.count({ where: { AND: [studentScope, { enrolmentChannel: "RETAIL" }] } }),
      this.prisma.student.count({ where: { AND: [studentScope, { enrolmentChannel: "COLLEGE" }] } }),
      this.prisma.trainer.count({ where: { ...liveOnly(), ...cityScope(principal) } }),
      this.prisma.college.count({ where: collegeWhere }),
      // The catalogue is not city-scoped — it is the same everywhere — so this
      // figure is deliberately global.
      this.prisma.questionBank.count({ where: liveOnly() }),
    ]);

    return {
      students: { total: retail + college, retail, college },
      trainers,
      colleges,
      questionBank,
    };
  }

  /** Queues that should reach zero, not statistics. */
  private async actions(
    principal: Principal,
    studentScope: Prisma.StudentWhereInput,
    batchScope: Prisma.BatchWhereInput,
    collegeWhere: Prisma.CollegeWhereInput,
  ) {
    const [unallocated, overdue, awaitingApproval, missingRecordings] = await Promise.all([
      this.prisma.student.count({
        where: { ...studentScope, batchMappings: { none: { deletedAt: null } } },
      }),
      // Both parents. An overdue college invoice matters as much as a
      // student's, and counting only one half would understate the queue.
      this.prisma.feeInstallment.count({
        where: {
          ...liveOnly(),
          status: "OVERDUE",
          OR: [
            { ledger: { deletedAt: null, student: studentScope } },
            { contract: { deletedAt: null, college: collegeWhere } },
          ],
        },
      }),
      this.prisma.certificateSubmissionRow.count({
        where: {
          ...liveOnly(),
          status: "PENDING",
          submission: { deletedAt: null, status: { in: ["SUBMITTED", "UNDER_REVIEW"] }, college: collegeWhere },
        },
      }),
      // Completion prompts for the recording, so a completed session without
      // one is an outstanding task rather than a fact.
      this.prisma.batchSession.count({
        where: { ...liveOnly(), status: "COMPLETED", recording: null, batch: batchScope },
      }),
    ]);

    return {
      unallocatedStudents: unallocated,
      overdueInstallments: overdue,
      certificatesAwaitingApproval: awaitingApproval,
      sessionsMissingRecordings: missingRecordings,
    };
  }

  /**
   * Money, split by who is billed. Retail totals come from student ledgers;
   * college totals from contracts (invariant 3) — the two are never added
   * together before being reported separately.
   */
  private async collections(
    principal: Principal,
    studentScope: Prisma.StudentWhereInput,
    collegeWhere: Prisma.CollegeWhereInput,
  ): Promise<Dashboard["collections"]> {
    const [ledgers, contracts, retailOverdue, collegeOverdue] = await Promise.all([
      this.prisma.studentFeeLedger.aggregate({
        where: { ...liveOnly(), student: studentScope },
        _sum: { enrolmentValueMinor: true, totalPaidMinor: true, balancePendingMinor: true },
      }),
      this.prisma.collegeContract.aggregate({
        where: { ...liveOnly(), status: { not: "CANCELLED" }, college: collegeWhere },
        _sum: { totalValueMinor: true, totalPaidMinor: true, balancePendingMinor: true },
      }),
      this.prisma.feeInstallment.aggregate({
        where: { ...liveOnly(), status: "OVERDUE", ledger: { deletedAt: null, student: studentScope } },
        _sum: { amountMinor: true, paidAmountMinor: true },
      }),
      this.prisma.feeInstallment.aggregate({
        where: { ...liveOnly(), status: "OVERDUE", contract: { deletedAt: null, college: collegeWhere } },
        _sum: { amountMinor: true, paidAmountMinor: true },
      }),
    ]);

    const n = (v: bigint | null | undefined) => v ?? 0n;
    const retailOverdueMinor = n(retailOverdue._sum.amountMinor) - n(retailOverdue._sum.paidAmountMinor);
    const collegeOverdueMinor = n(collegeOverdue._sum.amountMinor) - n(collegeOverdue._sum.paidAmountMinor);

    const segmented = (retail: bigint, college: bigint): SegmentedMoney => ({
      total: (retail + college).toString(),
      retail: retail.toString(),
      college: college.toString(),
    });

    return {
      billed: segmented(n(ledgers._sum.enrolmentValueMinor), n(contracts._sum.totalValueMinor)),
      collected: segmented(n(ledgers._sum.totalPaidMinor), n(contracts._sum.totalPaidMinor)),
      outstanding: segmented(n(ledgers._sum.balancePendingMinor), n(contracts._sum.balancePendingMinor)),
      overdue: segmented(retailOverdueMinor, collegeOverdueMinor),
    };
  }


  /**
   * Twelve months of history, oldest first.
   *
   * **Every month is present, including the empty ones.** A series that drops
   * the months where nothing happened draws a straight line through the
   * quarter where collections stopped — which is precisely the shape somebody
   * needed to see. So the buckets are built first and the rows are dropped
   * into them.
   *
   * A payment's segment comes from its installment's PARENT, never from a
   * stored column: `fee_installments` carries a nullable `ledger_id` and a
   * nullable `contract_id` with a CHECK that exactly one is set (invariant 4),
   * so the parent IS the segment. The same reasoning as invariant 6 — a copy
   * alongside the fact is a second fact that can disagree with it.
   *
   * Two queries, not twenty-four. Grouping in the database and bucketing here
   * is one round trip per series; a month-by-month loop would be twelve.
   */
  private async trend(
    principal: Principal,
    studentScope: Prisma.StudentWhereInput,
    collegeWhere: Prisma.CollegeWhereInput,
  ): Promise<Dashboard["trend"]> {
    const MONTHS = 12;
    const now = new Date();
    // UTC throughout. A month boundary in local time puts a payment taken at
    // 11pm on the 31st into the wrong bucket for half the world.
    const startOfMonth = (offset: number): Date =>
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));

    const from = startOfMonth(MONTHS - 1);
    const key = (date: Date): string => date.toISOString().slice(0, 7);

    const buckets = new Map<string, { retailMinor: bigint; collegeMinor: bigint; retail: number; college: number }>();
    for (let i = MONTHS - 1; i >= 0; i -= 1) {
      buckets.set(key(startOfMonth(i)), { retailMinor: 0n, collegeMinor: 0n, retail: 0, college: 0 });
    }

    const [payments, enrolments] = await Promise.all([
      this.prisma.paymentTransaction.findMany({
        where: {
          ...liveOnly(),
          paidAt: { gte: from },
          // Scope reaches a payment through whichever parent its installment
          // has, which is also what tells us its segment.
          installment: {
            deletedAt: null,
            OR: [
              { ledger: { deletedAt: null, student: studentScope } },
              { contract: { deletedAt: null, college: collegeWhere } },
            ],
          },
        },
        select: {
          amountMinor: true,
          paidAt: true,
          // A REVERSAL is stored positive with this flag rather than as a
          // negative amount (the CHECK forbids negatives), and
          // `recordPayment`'s own comment warns about "a report that sums the
          // column without reading the flag". This is that report, so it reads
          // the flag.
          isReversal: true,
          installment: { select: { ledgerId: true, contractId: true } },
        },
      }),
      this.prisma.studentBatchMapping.findMany({
        where: {
          ...liveOnly(),
          enrolledAt: { gte: from },
          student: studentScope,
          batch: { ...liveOnly(), ...cityScope(principal), ...collegeScope(principal) },
        },
        select: { enrolledAt: true, student: { select: { enrolmentChannel: true } } },
      }),
    ]);

    for (const payment of payments) {
      const bucket = buckets.get(key(payment.paidAt));
      if (bucket === undefined) continue;
      /* A reversal SUBTRACTS, in the month it was recorded rather than the
         month of the payment it reverses. That is what actually happened to
         the money: it arrived in one month and went back out in another, and
         restating the earlier month would silently change a figure somebody
         has already reported. */
      const signed = payment.isReversal ? -payment.amountMinor : payment.amountMinor;
      // Exactly one of the two is set — the CHECK guarantees it — so this is a
      // resolution, not a guess.
      if (payment.installment.contractId !== null) bucket.collegeMinor += signed;
      else bucket.retailMinor += signed;
    }

    for (const mapping of enrolments) {
      const bucket = buckets.get(key(mapping.enrolledAt));
      if (bucket === undefined) continue;
      if (mapping.student.enrolmentChannel === "COLLEGE") bucket.college += 1;
      else bucket.retail += 1;
    }

    const months = [...buckets.entries()].map(([month, b]) => ({
      month,
      collected: {
        total: (b.retailMinor + b.collegeMinor).toString(),
        retail: b.retailMinor.toString(),
        college: b.collegeMinor.toString(),
      },
      enrolments: { total: b.retail + b.college, retail: b.retail, college: b.college },
    }));

    // The last two buckets are this month and the one before it. They exist
    // even when empty, which is why this can index rather than search.
    const blankMoney = { total: "0", retail: "0", college: "0" };
    const blankCount = { total: 0, retail: 0, college: 0 };
    const current = months[months.length - 1];
    const previous = months[months.length - 2];

    return {
      months,
      collectedThisMonth: current?.collected ?? blankMoney,
      collectedLastMonth: previous?.collected ?? blankMoney,
      enrolmentsThisMonth: current?.enrolments ?? blankCount,
      enrolmentsLastMonth: previous?.enrolments ?? blankCount,
    };
  }

  private async delivery(
    batchScope: Prisma.BatchWhereInput,
    studentScope: Prisma.StudentWhereInput,
  ): Promise<Dashboard["delivery"]> {
    const now = new Date();
    const weekEnd = new Date(now.getTime() + 7 * 86_400_000);

    const [retailBatches, collegeBatches, thisWeek, completed, retailCerts, collegeCerts] =
      await Promise.all([
        // AND-composed rather than spread.
        //
        // `{ ...batchScope, collegeId: null }` looks equivalent and is not:
        // batchScope already sets collegeId for a college-scoped principal, and
        // the later key silently REPLACES it — which handed a college user the
        // count of every retail batch in the system. A leak of exactly the kind
        // a dashboard makes invisible, because the number simply looks large.
        this.prisma.batch.count({
          where: { AND: [batchScope, { collegeId: null, status: { in: ["SCHEDULED", "IN_PROGRESS"] } }] },
        }),
        this.prisma.batch.count({
          where: { AND: [batchScope, { collegeId: { not: null }, status: { in: ["SCHEDULED", "IN_PROGRESS"] } }] },
        }),
        this.prisma.batchSession.count({
          where: {
            ...liveOnly(), batch: batchScope,
            status: { in: ["SCHEDULED", "LIVE"] },
            scheduledDate: { gte: now, lte: weekEnd },
          },
        }),
        this.prisma.batchSession.count({
          where: { ...liveOnly(), batch: batchScope, status: "COMPLETED" },
        }),
        this.prisma.certificate.count({
          where: {
            ...liveOnly(), status: "ISSUED",
            student: { AND: [studentScope, { enrolmentChannel: "RETAIL" }] },
          },
        }),
        this.prisma.certificate.count({
          where: {
            ...liveOnly(), status: "ISSUED",
            student: { AND: [studentScope, { enrolmentChannel: "COLLEGE" }] },
          },
        }),
      ]);

    return {
      activeBatches: {
        total: retailBatches + collegeBatches,
        retail: retailBatches,
        college: collegeBatches,
      },
      sessionsThisWeek: thisWeek,
      sessionsCompleted: completed,
      certificatesIssued: {
        total: retailCerts + collegeCerts,
        retail: retailCerts,
        college: collegeCerts,
      },
    };
  }

  private async topCourses(
    batchScope: Prisma.BatchWhereInput,
    studentScope: Prisma.StudentWhereInput,
  ): Promise<Dashboard["topCourses"]> {
    // Only courses that actually have delivery IN SCOPE — a course with no
    // batch in this region is not this region's course to report on.
    const courses = await this.prisma.course.findMany({
      where: { ...liveOnly(), batches: { some: batchScope } },
      select: { courseId: true, courseCode: true, name: true },
      take: 50,
    });

    const rows = await Promise.all(
      courses.map(async (course) => {
        const inCourse = {
          deletedAt: null,
          batch: { AND: [batchScope, { courseId: course.courseId }] },
        } satisfies Prisma.StudentBatchMappingWhereInput;

        const [retail, college, activeBatches, revenue] = await Promise.all([
          this.prisma.studentBatchMapping.count({
            where: { ...inCourse, student: { AND: [studentScope, { enrolmentChannel: "RETAIL" }] } },
          }),
          this.prisma.studentBatchMapping.count({
            where: { ...inCourse, student: { AND: [studentScope, { enrolmentChannel: "COLLEGE" }] } },
          }),
          this.prisma.batch.count({
            where: { AND: [batchScope, { courseId: course.courseId, status: { in: ["SCHEDULED", "IN_PROGRESS"] } }] },
          }),
          this.prisma.studentFeeLedger.aggregate({
            where: { ...liveOnly(), courseId: course.courseId, student: studentScope },
            _sum: { totalPaidMinor: true },
          }),
        ]);

        return {
          courseId: course.courseId,
          courseCode: course.courseCode,
          name: course.name,
          enrolled: { total: retail + college, retail, college } satisfies SegmentedCount,
          activeBatches,
          revenueMinor: (revenue._sum.totalPaidMinor ?? 0n).toString(),
        };
      }),
    );

    return rows.sort((a, b) => b.enrolled.total - a.enrolled.total).slice(0, 10);
  }

  private async trainerLoad(principal: Principal): Promise<Dashboard["trainerLoad"]> {
    const now = new Date();
    const trainers = await this.prisma.trainer.findMany({
      where: { ...liveOnly(), ...cityScope(principal), accountStatus: "ACTIVE" },
      select: {
        trainerId: true, trainerCode: true, name: true,
        _count: { select: { courses: { where: { deletedAt: null } } } },
      },
      take: 50,
    });

    const rows = await Promise.all(
      trainers.map(async (t) => {
        const [confirmedBatches, sessionsUpcoming] = await Promise.all([
          this.prisma.batch.count({
            where: {
              ...liveOnly(), ...cityScope(principal), ...collegeScope(principal),
              primaryTrainerId: t.trainerId,
              status: { in: ["SCHEDULED", "IN_PROGRESS"] },
            },
          }),
          this.prisma.batchSession.count({
            where: {
              ...liveOnly(), trainerId: t.trainerId,
              status: { in: ["SCHEDULED", "LIVE"] },
              scheduledDate: { gte: now },
              batch: { ...liveOnly(), ...cityScope(principal), ...collegeScope(principal) },
            },
          }),
        ]);

        return {
          trainerId: t.trainerId,
          trainerCode: t.trainerCode,
          name: t.name,
          confirmedBatches,
          sessionsUpcoming,
          approvedCourses: t._count.courses,
        };
      }),
    );

    return rows.sort((a, b) => b.sessionsUpcoming - a.sessionsUpcoming).slice(0, 10);
  }
}

/** Human-readable scope, so a figure is never read as global by mistake. */
function describeScope(principal: Principal): string {
  if (principal.collegeScope !== null) return "This college only";
  if (principal.cityScope === null) return "All regions";
  if (principal.cityScope.length === 0) return "No region assigned";
  return `${principal.cityScope.length} region${principal.cityScope.length === 1 ? "" : "s"}`;
}
