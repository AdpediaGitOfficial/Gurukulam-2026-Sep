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
/**
 * How many rows a ranked list shows.
 *
 * It is the size of the CUT, applied after ranking the whole population —
 * never a limit on what was ranked. The distinction is the entire bug this
 * module used to have.
 */
const TOP_N = 10;

/** A trainer at or above this many live batches is one cancellation from trouble. */
const STRETCHED_AT = 5;

/** How far ahead an unstaffed batch still counts as a staffing emergency. */
const STAFFING_HORIZON_DAYS = 14;

/** How long a trainer may sit on a proposal before it is somebody's problem. */
const PROPOSAL_PATIENCE_DAYS = 7;

/** A batch that is still expected to deliver. */
const isLive = (status: string): boolean =>
  status === "SCHEDULED" || status === "IN_PROGRESS";

/**
 * Everything both cards need to know about one batch, fetched once.
 *
 * The portfolio distribution, the exception queues and the course ranking are
 * three questions about the same rows. Asking them separately is how two
 * figures on one screen come to disagree — and it is three times the queries
 * for one answer.
 */
interface BatchFact {
  batchId: string;
  courseId: string;
  status: string;
  startDate: Date;
  maxCapacity: number | null;
  /** Sessions still in the plan. CANCELLED is excluded: a called-off session
   *  is a slot that went away, not one that is owed. */
  sessionsPlanned: number;
  sessionsDelivered: number;
  retail: number;
  college: number;
}

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

    // Fetched before the rest so the portfolio card and the course ranking
    // read the same rows rather than two queries that can disagree.
    const facts = await this.batchFacts(batchScope, studentScope);

    const [headline, actions, collections, trend, delivery, portfolio, topCourses, trainers] =
      await Promise.all([
        this.headline(principal, studentScope, collegeWhere),
        this.actions(principal, studentScope, batchScope, collegeWhere),
        this.collections(principal, studentScope, collegeWhere),
        this.trend(principal, studentScope, collegeWhere),
        this.delivery(batchScope, studentScope),
        this.portfolio(facts, batchScope),
        this.topCourses(facts, studentScope),
        this.trainerPanel(principal),
      ]);

    return {
      headline,
      actions,
      collections,
      trend,
      delivery,
      portfolio,
      capacity: trainers.capacity,
      topCourses,
      trainerLoad: trainers.load,
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

  /**
   * One pass over every batch in scope, with its sessions and its roster.
   *
   * Four queries regardless of how many batches there are, and no query per
   * anything. Everything downstream folds this in memory, which is bounded by
   * BATCHES rather than courses or trainers — a few thousand rows of six
   * fields. Past roughly 50,000 batches in a single scope this wants to become
   * grouped SQL; until then the in-memory fold keeps the scope predicate in
   * one place, which is worth more than the milliseconds.
   */
  private async batchFacts(
    batchScope: Prisma.BatchWhereInput,
    studentScope: Prisma.StudentWhereInput,
  ): Promise<BatchFact[]> {
    const enrolmentsIn = (channel: "RETAIL" | "COLLEGE") =>
      this.prisma.studentBatchMapping.groupBy({
        by: ["batchId"],
        // The relation filter rather than an id list: `batchId: { in: [...] }`
        // would ship every batch id in scope to the server on every load.
        where: {
          deletedAt: null,
          batch: batchScope,
          student: { AND: [studentScope, { enrolmentChannel: channel }] },
        },
        _count: { _all: true },
      });

    const [batches, sessionRows, retailRows, collegeRows] = await Promise.all([
      this.prisma.batch.findMany({
        where: batchScope,
        select: {
          batchId: true,
          courseId: true,
          status: true,
          startDate: true,
          maxCapacity: true,
        },
      }),
      this.prisma.batchSession.groupBy({
        by: ["batchId", "status"],
        where: { ...liveOnly(), batch: batchScope },
        _count: { _all: true },
      }),
      enrolmentsIn("RETAIL"),
      enrolmentsIn("COLLEGE"),
    ]);

    const planned = new Map<string, number>();
    const delivered = new Map<string, number>();
    for (const row of sessionRows) {
      // A cancelled session left the plan; counting it would make a batch that
      // dropped half its schedule look permanently half-delivered.
      if (row.status === "CANCELLED") continue;
      planned.set(row.batchId, (planned.get(row.batchId) ?? 0) + row._count._all);
      if (row.status === "COMPLETED") {
        delivered.set(row.batchId, (delivered.get(row.batchId) ?? 0) + row._count._all);
      }
    }
    const retailOf = new Map(retailRows.map((r) => [r.batchId, r._count._all]));
    const collegeOf = new Map(collegeRows.map((r) => [r.batchId, r._count._all]));

    return batches.map((batch) => ({
      batchId: batch.batchId,
      courseId: batch.courseId,
      status: batch.status,
      startDate: batch.startDate,
      maxCapacity: batch.maxCapacity,
      sessionsPlanned: planned.get(batch.batchId) ?? 0,
      sessionsDelivered: delivered.get(batch.batchId) ?? 0,
      retail: retailOf.get(batch.batchId) ?? 0,
      college: collegeOf.get(batch.batchId) ?? 0,
    }));
  }

  /**
   * The catalogue described, not sampled — plus the rows somebody must act on.
   *
   * A distribution is the only shape that survives growth. Ten courses out of
   * 1,217 describe ten courses; these four buckets describe all of them, in
   * one strip, and each one is a filter. The queue beneath is bounded by the
   * WORK rather than by a cut-off, which is what makes it a queue and not
   * another statistic.
   *
   * Bucketed per COURSE, from its batches in scope. A course delivered only in
   * another region reads as "not scheduled" here, which is why the dashboard
   * echoes the scope it was computed under.
   */
  private async portfolio(
    facts: readonly BatchFact[],
    batchScope: Prisma.BatchWhereInput,
  ): Promise<Dashboard["portfolio"]> {
    const onRoster: Prisma.StudentBatchMappingWhereInput = {
      deletedAt: null,
      batch: batchScope,
    };

    const [totalCourses, coursesWithoutTopics, enrolments, completed, exited] = await Promise.all([
      this.prisma.course.count({ where: liveOnly() }),
      this.prisma.course.count({
        where: { ...liveOnly(), topics: { none: { deletedAt: null } }, batches: { some: batchScope } },
      }),
      this.prisma.studentBatchMapping.count({ where: onRoster }),
      this.prisma.studentBatchMapping.count({ where: { ...onRoster, completedAt: { not: null } } }),
      // A soft-deleted mapping is "should not have been here" and is excluded
      // above; this is somebody who genuinely attended and then left.
      this.prisma.studentBatchMapping.count({ where: { ...onRoster, isActive: false } }),
    ]);

    const byCourse = new Map<
      string,
      { planned: number; delivered: number; live: number; enrolled: number }
    >();
    let stalledBatches = 0;
    let batchesOverCapacity = 0;
    const today = startOfToday();

    for (const fact of facts) {
      const row = byCourse.get(fact.courseId) ?? { planned: 0, delivered: 0, live: 0, enrolled: 0 };
      row.planned += fact.sessionsPlanned;
      row.delivered += fact.sessionsDelivered;
      row.enrolled += fact.retail + fact.college;
      if (isLive(fact.status)) row.live += 1;
      byCourse.set(fact.courseId, row);

      // Started on paper, nothing delivered. The single most useful thing this
      // card can point at: a cohort that is quietly not happening.
      if (isLive(fact.status) && fact.startDate < today && fact.sessionsDelivered === 0) {
        stalledBatches += 1;
      }
      if (fact.maxCapacity !== null && fact.retail + fact.college > fact.maxCapacity) {
        batchesOverCapacity += 1;
      }
    }

    let notStarted = 0;
    let inFlight = 0;
    let complete = 0;
    let withLiveDelivery = 0;
    let coursesWithoutEnrolment = 0;

    for (const row of byCourse.values()) {
      if (row.live > 0) withLiveDelivery += 1;
      if (row.live > 0 && row.enrolled === 0) coursesWithoutEnrolment += 1;
      if (row.planned === 0) continue; // falls into NOT_SCHEDULED below
      if (row.delivered === 0) notStarted += 1;
      else if (row.delivered < row.planned) inFlight += 1;
      else complete += 1;
    }

    // Everything the three buckets above did not claim: courses with no
    // timetable in this scope at all, INCLUDING courses with no batch. That is
    // the honest home for them — "not scheduled" is exactly what they are —
    // and it keeps the band's total equal to the catalogue, so a reader can
    // check the arithmetic.
    const notScheduled = Math.max(0, totalCourses - notStarted - inFlight - complete);

    return {
      totalCourses,
      withLiveDelivery,
      delivery: [
        { bucket: "NOT_SCHEDULED", count: notScheduled },
        { bucket: "NOT_STARTED", count: notStarted },
        { bucket: "IN_FLIGHT", count: inFlight },
        { bucket: "COMPLETE", count: complete },
      ],
      stalledBatches,
      coursesWithoutEnrolment,
      batchesOverCapacity,
      coursesWithoutTopics,
      enrolments,
      completedEnrolments: completed,
      exitedEnrolments: exited,
    };
  }

  /**
   * The largest courses, ranked across the WHOLE catalogue.
   *
   * ── What this replaced, and why it mattered ──────────────────────────
   *
   * The first version read `findMany({ take: 50 })` with NO ordering, fired
   * four more queries per course, then sorted those fifty and kept ten. Two
   * things were wrong with that and only one of them was speed.
   *
   * Grown to 1,217 courses, the endpoint answered in 124ms and named
   * "Scale Course 906" with zero enrolments among its top ten while
   * Data Analytics, the actual leader, was absent. `take` without `orderBy`
   * is an ARBITRARY fifty, so "the top ten courses" was really "the top ten
   * of a random 4% sample" — and the sample gets smaller as the business
   * grows, which is the opposite of how a report should age.
   *
   * ── The shape now ───────────────────────────────────────────────────
   *
   * Five queries, none of them per-course, every one covering the full
   * population; the ranking happens over all of it and the cut to ten is the
   * LAST step rather than the first. Scope stays in Prisma `where` fragments
   * so invariant 11 is applied the same way it is everywhere else — a raw
   * SQL rewrite would have been faster still and would have forked the scope
   * predicate, which is the one thing worth more than the milliseconds.
   *
   * Folding per-batch counts in memory is bounded by BATCHES, not courses. At
   * a few thousand that is nothing. Past roughly 50,000 batches in one scope
   * this wants to become a grouped raw query with the scope predicate
   * generated from the same helpers.
   *
   * The per-batch facts arrive from `batchFacts`, shared with the portfolio
   * card, because both answer questions about the same rows and fetching them
   * twice is how two figures on one screen come to disagree.
   */
  private async topCourses(
    facts: readonly BatchFact[],
    studentScope: Prisma.StudentWhereInput,
  ): Promise<Dashboard["topCourses"]> {
    if (facts.length === 0) return [];

    const revenueRows = await this.prisma.studentFeeLedger.groupBy({
      by: ["courseId"],
      where: { ...liveOnly(), student: studentScope },
      _sum: { totalPaidMinor: true },
    });

    // A course with no batch in scope is not this region's course to report
    // on — the same rule the previous version applied, kept deliberately.
    const byCourse = new Map<
      string,
      { retail: number; college: number; activeBatches: number }
    >();
    for (const fact of facts) {
      const row = byCourse.get(fact.courseId) ?? { retail: 0, college: 0, activeBatches: 0 };
      if (isLive(fact.status)) row.activeBatches += 1;
      row.retail += fact.retail;
      row.college += fact.college;
      byCourse.set(fact.courseId, row);
    }

    const revenueOf = new Map(
      revenueRows.map((r) => [r.courseId, r._sum.totalPaidMinor ?? 0n]),
    );

    // Ranked over every course that has delivery in scope, THEN cut to ten.
    const ranked = [...byCourse.entries()]
      .map(([courseId, row]) => ({ courseId, ...row, total: row.retail + row.college }))
      .sort((a, b) => b.total - a.total || b.activeBatches - a.activeBatches)
      .slice(0, TOP_N);

    if (ranked.length === 0) return [];

    // Names for the ten that survived, not for the catalogue.
    const named = await this.prisma.course.findMany({
      where: { courseId: { in: ranked.map((r) => r.courseId) } },
      select: { courseId: true, courseCode: true, name: true },
    });
    const nameOf = new Map(named.map((c) => [c.courseId, c]));

    return ranked.map((row) => {
      const course = nameOf.get(row.courseId);
      return {
        courseId: row.courseId,
        courseCode: course?.courseCode ?? "—",
        name: course?.name ?? "—",
        enrolled: {
          total: row.total,
          retail: row.retail,
          college: row.college,
        } satisfies SegmentedCount,
        activeBatches: row.activeBatches,
        revenueMinor: (revenueOf.get(row.courseId) ?? 0n).toString(),
      };
    });
  }

  /**
   * The most loaded trainers, ranked across every active trainer in scope.
   *
   * Same defect as `topCourses` and the same fix: fifty unordered trainers
   * with two queries each, sorted after the sample was already taken. At 291
   * trainers the two busiest people in the business — four and three sessions
   * ahead — did not appear on the list at all, while trainers with zero did.
   *
   * Four queries now, all population-wide. The trainer roster is fetched whole
   * because it is the thing being ranked and because ACTIVE and city scope
   * have to be applied to the trainer, not to their batches; at a few thousand
   * rows of three columns that is cheap, and it is the row count to watch if
   * the business ever has tens of thousands of trainers.
   */
  private async trainerPanel(
    principal: Principal,
  ): Promise<{ load: Dashboard["trainerLoad"]; capacity: Dashboard["capacity"] }> {
    const now = new Date();
    // `startDate` is a DATE column, so the window is anchored to midnight
    // rather than to the current instant. Compared against `now`, a batch
    // starting TODAY — the most urgent one there is — falls outside the
    // window the moment the clock passes midnight, and whether it does at all
    // depends on how the driver narrows a timestamp to a date. Neither is
    // something a staffing queue should rest on.
    const from = startOfToday();
    const staffingHorizon = addDays(from, STAFFING_HORIZON_DAYS);
    const patienceRanOut = addDays(now, -PROPOSAL_PATIENCE_DAYS);
    const deliveryScope: Prisma.BatchWhereInput = {
      ...liveOnly(),
      ...cityScope(principal),
      ...collegeScope(principal),
    };

    const [
      trainers,
      batchRows,
      sessionRows,
      courseRows,
      clashRows,
      unstaffedBatchesSoon,
      staleProposals,
      trainersWithoutCourses,
      sessionsDecided,
      sessionsOnPlan,
    ] = await Promise.all([
      this.prisma.trainer.findMany({
        where: { ...liveOnly(), ...cityScope(principal), accountStatus: "ACTIVE" },
        select: { trainerId: true, trainerCode: true, name: true },
      }),
      this.prisma.batch.groupBy({
        by: ["primaryTrainerId"],
        where: {
          ...deliveryScope,
          primaryTrainerId: { not: null },
          status: { in: ["SCHEDULED", "IN_PROGRESS"] },
        },
        _count: { _all: true },
      }),
      this.prisma.batchSession.groupBy({
        by: ["trainerId"],
        where: {
          ...liveOnly(),
          trainerId: { not: null },
          status: { in: ["SCHEDULED", "LIVE"] },
          scheduledDate: { gte: now },
          batch: deliveryScope,
        },
        _count: { _all: true },
      }),
      this.prisma.trainerCourse.groupBy({
        by: ["trainerId"],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      // One trainer, one day, one start time, two live sessions. The same key
      // the uniqueness index uses for a BATCH — a person cannot be in two
      // places at once any more than a cohort can. `having` does the work in
      // the database; only the offending slots come back.
      this.prisma.batchSession.groupBy({
        by: ["trainerId", "scheduledDate", "startTime"],
        where: {
          ...liveOnly(),
          trainerId: { not: null },
          status: { in: ["SCHEDULED", "LIVE"] },
          batch: deliveryScope,
        },
        _count: { _all: true },
        having: { trainerId: { _count: { gt: 1 } } },
      }),
      this.prisma.batch.count({
        where: {
          ...deliveryScope,
          primaryTrainerId: null,
          status: "SCHEDULED",
          startDate: { gte: from, lte: staffingHorizon },
        },
      }),
      this.prisma.batchTrainerAssignment.count({
        where: {
          ...liveOnly(),
          status: "PROPOSED",
          proposedAt: { lt: patienceRanOut },
          batch: deliveryScope,
        },
      }),
      this.prisma.trainer.count({
        where: {
          ...liveOnly(),
          ...cityScope(principal),
          accountStatus: "ACTIVE",
          courses: { none: { deletedAt: null } },
        },
      }),
      // Adherence, over sessions that have actually been decided one way or
      // the other in the last month. A scheduled session in the future is not
      // evidence about anything yet.
      this.prisma.batchSession.count({
        where: {
          ...liveOnly(),
          status: { in: ["COMPLETED", "CANCELLED"] },
          scheduledDate: { gte: addDays(startOfToday(), -30) },
          batch: deliveryScope,
        },
      }),
      this.prisma.batchSession.count({
        where: {
          ...liveOnly(),
          status: "COMPLETED",
          rescheduledFrom: null,
          scheduledDate: { gte: addDays(startOfToday(), -30) },
          batch: deliveryScope,
        },
      }),
    ]);

    const countBy = (
      rows: Array<{ _count: { _all: number } }>,
      key: (row: never) => string | null,
    ): Map<string, number> => {
      const out = new Map<string, number>();
      for (const row of rows) {
        const id = key(row as never);
        if (id !== null) out.set(id, row._count._all);
      }
      return out;
    };

    const batchesOf = countBy(batchRows, (r: { primaryTrainerId: string | null }) => r.primaryTrainerId);
    const sessionsOf = countBy(sessionRows, (r: { trainerId: string | null }) => r.trainerId);
    const coursesOf = countBy(courseRows, (r: { trainerId: string }) => r.trainerId);

    const rows = trainers.map((t) => ({
      trainerId: t.trainerId,
      trainerCode: t.trainerCode,
      name: t.name,
      confirmedBatches: batchesOf.get(t.trainerId) ?? 0,
      sessionsUpcoming: sessionsOf.get(t.trainerId) ?? 0,
      approvedCourses: coursesOf.get(t.trainerId) ?? 0,
    }));

    // Utilisation is bucketed from the SAME rows the ranking uses, so the band
    // and the table can never disagree about who is active or how loaded they
    // are. Counting from `batchRows` alone would quietly include a suspended
    // trainer still attached to a live batch.
    let bench = 0;
    let light = 0;
    let busy = 0;
    let stretched = 0;
    for (const row of rows) {
      if (row.confirmedBatches === 0) bench += 1;
      else if (row.confirmedBatches <= 2) light += 1;
      else if (row.confirmedBatches < STRETCHED_AT) busy += 1;
      else stretched += 1;
    }

    const doubleBookedTrainers = new Set(
      clashRows.map((r) => r.trainerId).filter((id): id is string => id !== null),
    ).size;

    return {
      load: rows
        .slice()
        .sort(
          (a, b) =>
            b.sessionsUpcoming - a.sessionsUpcoming ||
            b.confirmedBatches - a.confirmedBatches ||
            a.name.localeCompare(b.name),
        )
        .slice(0, TOP_N),
      capacity: {
        activeTrainers: rows.length,
        carryingDelivery: rows.length - bench,
        utilisation: [
          { bucket: "BENCH", count: bench },
          { bucket: "LIGHT", count: light },
          { bucket: "BUSY", count: busy },
          { bucket: "STRETCHED", count: stretched },
        ],
        unstaffedBatchesSoon,
        doubleBookedTrainers,
        staleProposals,
        trainersWithoutCourses,
        sessionsDecided,
        sessionsOnPlan,
      },
    };
  }
}

/** Midnight today, so "past its start date" does not fire on the start date. */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const addDays = (from: Date, days: number): Date =>
  new Date(from.getTime() + days * 24 * 60 * 60 * 1000);

/** Human-readable scope, so a figure is never read as global by mistake. */
function describeScope(principal: Principal): string {
  if (principal.collegeScope !== null) return "This college only";
  if (principal.cityScope === null) return "All regions";
  if (principal.cityScope.length === 0) return "No region assigned";
  return `${principal.cityScope.length} region${principal.cityScope.length === 1 ? "" : "s"}`;
}
