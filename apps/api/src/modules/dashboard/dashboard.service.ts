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

    const [headline, actions, collections, delivery, topCourses, trainerLoad] = await Promise.all([
      this.headline(principal, studentScope, collegeWhere),
      this.actions(principal, studentScope, batchScope, collegeWhere),
      this.collections(principal, studentScope, collegeWhere),
      this.delivery(batchScope, studentScope),
      this.topCourses(batchScope, studentScope),
      this.trainerLoad(principal),
    ]);

    return {
      headline,
      actions,
      collections,
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
