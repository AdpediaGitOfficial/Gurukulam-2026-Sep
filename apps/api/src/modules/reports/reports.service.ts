import { Injectable } from "@nestjs/common";
import { Prisma } from "@gurukulam/db";
import type {
  BatchProgressRow, CollectionRow, Measure, OutstandingRow, Principal,
  Report, ReportMeta, ReportQuery, UnallocatedRow,
} from "@gurukulam/contracts";
import { PrismaService } from "../prisma/prisma.module";
import { ApiException } from "../../common/errors";
import { cityScope, collegeScope, liveOnly } from "../../common/scope/scope";

/**
 * The four reports that earn their place immediately.
 *
 * All four share one request shape and one envelope, because the grammar is
 * the point: `MEASURES × DIMENSIONS × FILTERS`. The remaining catalogue
 * entries slot into the same shape rather than each inventing their own.
 *
 * Scope is applied to every measure and every row, and echoed back in the
 * envelope. A report is the easiest place to leak another region's data
 * precisely because it feels like just numbers — there is no record on screen
 * that looks wrong, only a total that is quietly too large.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Outstanding money, aged, across BOTH billing parents. */
  async outstanding(principal: Principal, query: ReportQuery): Promise<Report<OutstandingRow>> {
    const { from, to } = this.window(query);
    const now = new Date();

    const studentWhere = this.studentScope(principal, query);
    const collegeWhere = this.collegeWhereFor(principal, query);

    const [ledgers, contracts] = await Promise.all([
      query.segment === "COLLEGE"
        ? []
        : this.prisma.studentFeeLedger.findMany({
            where: {
              ...liveOnly(),
              student: studentWhere,
              balancePendingMinor: { gt: 0 },
              ...(query.courseId ? { courseId: query.courseId } : {}),
              ...(query.batchId ? { batchId: query.batchId } : {}),
            },
            include: {
              student: { select: { studentCode: true, firstName: true, lastName: true } },
              course: { select: { name: true } },
              installments: {
                where: { deletedAt: null, status: { not: "PAID" } },
                orderBy: { dueDate: "asc" },
              },
            },
          }),
      query.segment === "RETAIL"
        ? []
        : this.prisma.collegeContract.findMany({
            where: {
              ...liveOnly(),
              status: { notIn: ["CANCELLED", "DRAFT"] },
              college: collegeWhere,
              balancePendingMinor: { gt: 0 },
              ...(query.courseId ? { courseId: query.courseId } : {}),
            },
            include: {
              college: { select: { name: true } },
              course: { select: { name: true } },
              installments: {
                where: { deletedAt: null, status: { not: "PAID" } },
                orderBy: { dueDate: "asc" },
              },
            },
          }),
    ]);

    const rows: OutstandingRow[] = [
      ...ledgers.map((l) => {
        const oldest = l.installments.find((i) => i.dueDate < now);
        const days = oldest ? daysBetween(oldest.dueDate, now) : 0;
        return {
          parentType: "STUDENT" as const,
          parentId: l.studentId,
          parentName: [l.student.firstName, l.student.lastName].filter(Boolean).join(" "),
          reference: l.student.studentCode,
          courseName: l.course?.name ?? null,
          totalMinor: l.enrolmentValueMinor.toString(),
          paidMinor: l.totalPaidMinor.toString(),
          outstandingMinor: l.balancePendingMinor.toString(),
          oldestOverdueDays: days,
          bucket: bucketOf(days),
          nextDueDate: l.installments[0]?.dueDate.toISOString().slice(0, 10) ?? null,
        };
      }),
      ...contracts.map((c) => {
        const oldest = c.installments.find((i) => i.dueDate < now);
        const days = oldest ? daysBetween(oldest.dueDate, now) : 0;
        return {
          parentType: "COLLEGE" as const,
          parentId: c.collegeId,
          parentName: c.college.name,
          reference: c.contractCode,
          courseName: c.course?.name ?? null,
          totalMinor: (c.totalValueMinor ?? 0n).toString(),
          paidMinor: c.totalPaidMinor.toString(),
          outstandingMinor: c.balancePendingMinor.toString(),
          oldestOverdueDays: days,
          bucket: bucketOf(days),
          nextDueDate: c.installments[0]?.dueDate.toISOString().slice(0, 10) ?? null,
        };
      }),
    ].sort((a, b) => b.oldestOverdueDays - a.oldestOverdueDays);

    const sum = (f: (r: OutstandingRow) => string) =>
      rows.reduce((t, r) => t + BigInt(f(r)), 0n);
    const overdue = rows.filter((r) => r.oldestOverdueDays > 0);

    const measures: Measure[] = [
      money("outstanding", "Total outstanding", sum((r) => r.outstandingMinor)),
      money("overdue", "Of which overdue", overdue.reduce((t, r) => t + BigInt(r.outstandingMinor), 0n)),
      count("parties", "Parties owing", rows.length),
      count("overdueParties", "Parties overdue", overdue.length),
    ];

    return {
      meta: this.meta(principal, query, "outstanding", "Outstanding & ageing", from, to, rows.length),
      measures,
      rows,
    };
  }

  /** Every receipt in the window, for reconciliation against the bank. */
  async collections(principal: Principal, query: ReportQuery): Promise<Report<CollectionRow>> {
    const { from, to, previousFrom, previousTo } = this.window(query);
    const studentWhere = this.studentScope(principal, query);
    const collegeWhere = this.collegeWhereFor(principal, query);

    const where = (a: Date, b: Date): Prisma.PaymentTransactionWhereInput => ({
      ...liveOnly(),
      paidAt: { gte: a, lte: b },
      installment: {
        deletedAt: null,
        OR: [
          ...(query.segment === "COLLEGE" ? [] : [{ ledger: { deletedAt: null, student: studentWhere } }]),
          ...(query.segment === "RETAIL" ? [] : [{ contract: { deletedAt: null, college: collegeWhere } }]),
        ],
      },
    });

    const transactions = await this.prisma.paymentTransaction.findMany({
      where: where(from, to),
      orderBy: { paidAt: "asc" },
      include: {
        installment: {
          include: {
            ledger: { include: { student: { select: { studentCode: true, firstName: true, lastName: true } } } },
            contract: { include: { college: { select: { name: true } } } },
          },
        },
      },
    });

    const rows: CollectionRow[] = transactions.map((t) => {
      const isStudent = t.installment.ledger !== null;
      const student = t.installment.ledger?.student;
      return {
        transactionCode: t.transactionCode,
        paidAt: t.paidAt.toISOString(),
        parentType: isStudent ? "STUDENT" : "COLLEGE",
        parentName: isStudent
          ? [student?.firstName, student?.lastName].filter(Boolean).join(" ")
          : (t.installment.contract?.college.name ?? ""),
        reference: isStudent
          ? (student?.studentCode ?? "")
          : (t.installment.contract?.contractCode ?? ""),
        amountMinor: t.amountMinor.toString(),
        paymentMode: t.paymentMode,
        externalTransactionId: t.externalTransactionId,
        bankOrHandle: t.bankOrHandle,
        isReversal: t.isReversal,
      };
    });

    // Reversals are subtracted rather than listed alongside: a register that
    // sums a reversed receipt as income does not reconcile.
    const net = rows.reduce(
      (t, r) => (r.isReversal ? t - BigInt(r.amountMinor) : t + BigInt(r.amountMinor)),
      0n,
    );

    let previous: bigint | null = null;
    if (query.compare && previousFrom && previousTo) {
      const prior = await this.prisma.paymentTransaction.findMany({
        where: where(previousFrom, previousTo),
        select: { amountMinor: true, isReversal: true },
      });
      previous = prior.reduce(
        (t, r) => (r.isReversal ? t - r.amountMinor : t + r.amountMinor),
        0n,
      );
    }

    const measures: Measure[] = [
      money("collected", "Net collected", net, previous),
      count("receipts", "Receipts", rows.filter((r) => !r.isReversal).length),
      count("reversals", "Reversals", rows.filter((r) => r.isReversal).length),
    ];

    return {
      meta: this.meta(principal, query, "collections", "Daily collection register", from, to, rows.length, previousFrom, previousTo),
      measures,
      rows,
    };
  }

  /** The gap between a record existing and revenue starting. */
  async unallocated(principal: Principal, query: ReportQuery): Promise<Report<UnallocatedRow>> {
    const { from, to } = this.window(query);
    const now = new Date();

    const students = await this.prisma.student.findMany({
      where: {
        ...this.studentScope(principal, query),
        // Computed from live roster rows, never a stored flag.
        batchMappings: { none: { deletedAt: null } },
        createdAt: { gte: from, lte: to },
      },
      orderBy: { createdAt: "asc" },
      include: {
        college: { select: { name: true } },
        city: { select: { name: true } },
      },
    });

    const rows: UnallocatedRow[] = students.map((s) => {
      const ageDays = daysBetween(s.createdAt, now);
      return {
        studentId: s.studentId,
        studentCode: s.studentCode,
        name: [s.firstName, s.lastName].filter(Boolean).join(" "),
        email: s.email,
        segment: s.enrolmentChannel,
        collegeName: s.college?.name ?? null,
        cityName: s.city?.name ?? null,
        createdAt: s.createdAt.toISOString(),
        ageDays,
        bucket: ageDays <= 3 ? "D0_3" : ageDays <= 7 ? "D4_7" : ageDays <= 14 ? "D8_14" : "D15_PLUS",
      createdByType: s.createdByType,
      };
    });

    const averageAge = rows.length
      ? Math.round(rows.reduce((t, r) => t + r.ageDays, 0) / rows.length)
      : 0;

    const measures: Measure[] = [
      count("unallocated", "Unallocated students", rows.length),
      { key: "averageAge", label: "Average age", value: String(averageAge), unit: "days", previous: null, delta: null },
      count("aged15", "Waiting 15 days or more", rows.filter((r) => r.bucket === "D15_PLUS").length),
    ];

    return {
      meta: this.meta(principal, query, "unallocated", "Unallocated students ageing", from, to, rows.length),
      measures,
      rows,
    };
  }

  /** How far each batch has actually got, and what is outstanding on it. */
  async batchProgress(principal: Principal, query: ReportQuery): Promise<Report<BatchProgressRow>> {
    const { from, to } = this.window(query);

    const batches = await this.prisma.batch.findMany({
      where: {
        ...liveOnly(),
        ...cityScope(principal),
        ...collegeScope(principal),
        ...(query.courseId ? { courseId: query.courseId } : {}),
        ...(query.collegeId ? { collegeId: query.collegeId } : {}),
        ...(query.batchId ? { batchId: query.batchId } : {}),
        ...(query.segment === "RETAIL" ? { collegeId: null } : {}),
        ...(query.segment === "COLLEGE" ? { collegeId: { not: null } } : {}),
        // A batch overlapping the window, not merely starting in it — a batch
        // running across the window is exactly what an operator is asking about.
        startDate: { lte: to },
        OR: [{ endDate: null }, { endDate: { gte: from } }],
      },
      orderBy: { startDate: "asc" },
      include: {
        college: { select: { name: true } },
        course: { select: { name: true } },
        primaryTrainer: { select: { name: true } },
        _count: { select: { studentMappings: { where: { deletedAt: null } } } },
      },
    });

    const rows = await Promise.all(
      batches.map(async (b) => {
        const [sessionsTotal, sessionsCompleted, recordingsMissing, certificates] = await Promise.all([
          this.prisma.batchSession.count({ where: { batchId: b.batchId, deletedAt: null } }),
          this.prisma.batchSession.count({ where: { batchId: b.batchId, deletedAt: null, status: "COMPLETED" } }),
          this.prisma.batchSession.count({
            where: { batchId: b.batchId, deletedAt: null, status: "COMPLETED", recording: null },
          }),
          this.prisma.certificate.count({
            where: { batchId: b.batchId, deletedAt: null, status: "ISSUED" },
          }),
        ]);

        return {
          batchId: b.batchId,
          batchCode: b.batchCode,
          name: b.name,
          segment: b.collegeId === null ? ("RETAIL" as const) : ("COLLEGE" as const),
          collegeName: b.college?.name ?? null,
          courseName: b.course?.name ?? null,
          trainerName: b.primaryTrainer?.name ?? null,
          status: b.status,
          startDate: b.startDate.toISOString().slice(0, 10),
          endDate: b.endDate?.toISOString().slice(0, 10) ?? null,
          enrolled: b._count.studentMappings,
          capacity: b.maxCapacity,
          sessionsTotal,
          sessionsCompleted,
          // A batch with no sessions scheduled is 0%, not NaN.
          progressPct: sessionsTotal === 0 ? 0 : Math.round((sessionsCompleted / sessionsTotal) * 100),
          recordingsMissing,
          certificatesIssued: certificates,
        };
      }),
    );

    const totalSessions = rows.reduce((t, r) => t + r.sessionsTotal, 0);
    const doneSessions = rows.reduce((t, r) => t + r.sessionsCompleted, 0);

    const measures: Measure[] = [
      count("batches", "Batches in window", rows.length),
      {
        key: "progress", label: "Overall progress", unit: "percent",
        value: String(totalSessions === 0 ? 0 : Math.round((doneSessions / totalSessions) * 100)),
        previous: null, delta: null,
      },
      count("recordingsMissing", "Recordings missing", rows.reduce((t, r) => t + r.recordingsMissing, 0)),
      count("enrolled", "Students enrolled", rows.reduce((t, r) => t + r.enrolled, 0)),
    ];

    return {
      meta: this.meta(principal, query, "batch-progress", "Batch progress", from, to, rows.length),
      measures,
      rows,
    };
  }

  // ── Shared ──────────────────────────────────────────────────────────────

  private window(query: ReportQuery) {
    const from = new Date(`${query.from.slice(0, 10)}T00:00:00.000Z`);
    const to = new Date(`${query.to.slice(0, 10)}T23:59:59.999Z`);
    if (Number.isNaN(from.getTime())) throw ApiException.validation({ from: "Enter a date like 2026-09-01" });
    if (Number.isNaN(to.getTime())) throw ApiException.validation({ to: "Enter a date like 2026-09-30" });
    if (to < from) throw ApiException.validation({ to: "The window cannot end before it starts" });

    // The comparison window is the immediately preceding period of EQUAL
    // length, so "up 12%" means against a like-for-like span rather than a
    // calendar month of a different number of days.
    const span = to.getTime() - from.getTime();
    const previousTo = query.compare ? new Date(from.getTime() - 1) : null;
    const previousFrom = previousTo ? new Date(previousTo.getTime() - span) : null;

    return { from, to, previousFrom, previousTo };
  }

  private studentScope(principal: Principal, query: ReportQuery): Prisma.StudentWhereInput {
    return {
      ...liveOnly(),
      ...cityScope(principal),
      ...collegeScope(principal),
      ...(query.cityId ? { cityId: query.cityId } : {}),
      ...(query.collegeId ? { collegeId: query.collegeId } : {}),
      ...(query.segment ? { enrolmentChannel: query.segment } : {}),
    };
  }

  private collegeWhereFor(principal: Principal, query: ReportQuery): Prisma.CollegeWhereInput {
    return {
      ...liveOnly(),
      ...cityScope(principal),
      ...collegeScope(principal, "collegeId"),
      ...(query.cityId ? { cityId: query.cityId } : {}),
      ...(query.collegeId ? { collegeId: query.collegeId } : {}),
    };
  }

  private meta(
    principal: Principal,
    query: ReportQuery,
    reportKey: string,
    title: string,
    from: Date,
    to: Date,
    rowCount: number,
    previousFrom?: Date | null,
    previousTo?: Date | null,
  ): ReportMeta {
    return {
      reportKey,
      title,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      comparedFrom: previousFrom?.toISOString().slice(0, 10) ?? null,
      comparedTo: previousTo?.toISOString().slice(0, 10) ?? null,
      scope: {
        cityIds: principal.cityScope,
        collegeId: principal.collegeScope,
        label:
          principal.collegeScope !== null
            ? "This college only"
            : principal.cityScope === null
              ? "All regions"
              : `${principal.cityScope.length} region${principal.cityScope.length === 1 ? "" : "s"}`,
      },
      generatedAt: new Date().toISOString(),
      rowCount,
    };
    void query;
  }
}

const money = (key: string, label: string, value: bigint, previous?: bigint | null): Measure => ({
  key, label, unit: "money",
  value: value.toString(),
  previous: previous?.toString() ?? null,
  delta: previous !== null && previous !== undefined ? (value - previous).toString() : null,
});

const count = (key: string, label: string, value: number): Measure => ({
  key, label, unit: "count", value: String(value), previous: null, delta: null,
});

const daysBetween = (a: Date, b: Date) =>
  Math.max(0, Math.floor((b.getTime() - a.getTime()) / 86_400_000));

function bucketOf(days: number): OutstandingRow["bucket"] {
  if (days <= 0) return "CURRENT";
  if (days <= 30) return "D1_30";
  if (days <= 60) return "D31_60";
  if (days <= 90) return "D61_90";
  return "D90_PLUS";
}

/**
 * CSV, quoted correctly.
 *
 * Money stays a string of minor units rather than being divided: a
 * spreadsheet that reads "4500000" and one that reads "45000.00" both open,
 * but only one of them still reconciles after someone reformats the column.
 */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  const escape = (v: unknown) => {
    const text = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\r\n");
}
