import { Injectable } from "@nestjs/common";
import type {
  CampusCourse,
  MeCollege,
  MeCollegeBilling,
  MeCollegeDashboard,
  MeContract,
  Principal,
} from "@gurukulam/contracts";
import { PrismaService } from "../prisma/prisma.module";
import { ApiException } from "../../common/errors";

/**
 * The institution's own surface.
 *
 * Every query is anchored to the SIGNED-IN USER's row, and the college id is
 * read from that row rather than from `principal.collegeScope` — they agree, and
 * taking it from the record means a doctored token cannot widen anything here
 * even if the principal builder were one day wrong. There is no college id
 * parameter on any of these routes, so the scope is structural.
 *
 * What is NOT here: cohorts, rosters, requirements, certificates. Those go
 * through the shared services with `collegeScope` applied inside them, because
 * a college reads rows the admin console reads too and the two must be one code
 * path. This file is the remainder — who they are, how the engagement is going,
 * and what they owe.
 */
@Injectable()
export class CollegeMeService {
  constructor(private readonly prisma: PrismaService) {}

  async profile(principal: Principal): Promise<MeCollege> {
    const user = await this.prisma.collegeUser.findFirst({
      where: { collegeUserId: principal.id, deletedAt: null },
      include: {
        poc: { select: { designation: true } },
        college: {
          select: {
            collegeId: true,
            collegeCode: true,
            name: true,
            partnershipType: true,
            website: true,
            city: { select: { name: true, state: true } },
          },
        },
      },
    });
    if (!user) throw ApiException.notFound("College account");

    return {
      collegeId: user.college.collegeId,
      collegeCode: user.college.collegeCode,
      name: user.college.name,
      partnershipType: user.college.partnershipType,
      cityName: user.college.city?.name ?? null,
      stateName: user.college.city?.state ?? null,
      website: user.college.website,
      user: {
        collegeUserId: user.collegeUserId,
        name: user.name,
        // Their real address, which is where invoices go (invariant 6 resolves
        // a contract installment's recipient through it) — deliberately not the
        // login identity below.
        email: user.email,
        loginEmail: user.loginEmail,
        phone: user.phone,
        designation: user.poc?.designation ?? null,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      },
    };
  }

  /**
   * How the engagement is going.
   *
   * Two rules shaped this. Every figure is computed from a row carrying THIS
   * college — nothing is a total of ours narrowed afterwards, which is the
   * failure mode that put 191 trainers and an operator queue on a college's
   * dashboard. And each figure is labelled by who has to act: a requirement
   * they raised that we have not answered is OUR queue, and saying so is the
   * difference between a portal that explains and one that nags.
   */
  async dashboard(principal: Principal): Promise<MeCollegeDashboard> {
    const collegeId = await this.collegeOf(principal);
    const today = startOfToday();
    const weekEnd = new Date(today.getTime() + 7 * 86400000);

    const [
      studentsEnrolled,
      studentIds,
      batchesRunning,
      sessionsThisWeek,
      nextSession,
      requirementsWithUs,
      submissionsWithUs,
    ] = await Promise.all([
      this.prisma.student.count({ where: { collegeId, deletedAt: null } }),
      this.prisma.student.findMany({
        where: { collegeId, deletedAt: null },
        select: { studentId: true },
      }),
      this.prisma.batch.count({
        where: { collegeId, deletedAt: null, status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
      }),
      this.prisma.batchSession.count({
        where: {
          deletedAt: null,
          batch: { collegeId, deletedAt: null },
          scheduledDate: { gte: today, lt: weekEnd },
          status: { not: "CANCELLED" },
        },
      }),
      this.prisma.batchSession.findFirst({
        where: {
          deletedAt: null,
          batch: { collegeId, deletedAt: null },
          scheduledDate: { gte: today },
          status: { not: "CANCELLED" },
        },
        orderBy: [{ scheduledDate: "asc" }, { startTime: "asc" }],
        include: SESSION_SHAPE,
      }),
      this.prisma.collegeRequirement.count({
        where: { collegeId, deletedAt: null, status: { in: ["NEW", "UNDER_REVIEW"] } },
      }),
      this.prisma.certificateSubmission.count({
        where: { collegeId, deletedAt: null, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
      }),
    ]);

    const ids = studentIds.map((s) => s.studentId);
    const [onACohort, certificatesReady] = await Promise.all([
      ids.length === 0
        ? Promise.resolve([] as { studentId: string }[])
        : this.prisma.studentBatchMapping
            .findMany({
              where: { studentId: { in: ids }, deletedAt: null, isActive: true },
              select: { studentId: true },
              distinct: ["studentId"],
            }),
      this.prisma.certificate.count({
        where: { deletedAt: null, status: "ISSUED", student: { collegeId } },
      }),
    ]);

    return {
      studentsEnrolled,
      studentsNotOnACohort: studentsEnrolled - onACohort.length,
      batchesRunning,
      sessionsThisWeek,
      nextSession: nextSession ? toSession(nextSession) : null,
      requirementsWithUs,
      submissionsWithUs,
      certificatesReady,
      billing: await this.billingTotals(collegeId),
    };
  }

  /**
   * What the institution owes, and against what.
   *
   * ── Why this is not `feeLedger` ─────────────────────────────────────────
   *
   * Invariant 3: billing follows segment, and a college student has no
   * individual ledger at all. The money in this segment hangs off the CONTRACT,
   * through the same installment engine with its other parent set (invariant 4).
   * Reading `fee_ledgers` here would return nothing and would read as "you owe
   * nothing", which is the most expensive empty state in the product.
   *
   * Every sum is `bigint` and leaves as a decimal string of paise. Nothing on
   * the screen adds money.
   */
  async billing(principal: Principal): Promise<MeCollegeBilling> {
    const collegeId = await this.collegeOf(principal);
    const contracts = await this.prisma.collegeContract.findMany({
      where: { collegeId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        course: { select: { name: true } },
        batch: { select: { batchCode: true } },
        installments: {
          where: { deletedAt: null },
          orderBy: { installmentNumber: "asc" },
        },
      },
    });

    const today = startOfToday();
    const rows: MeContract[] = contracts.map((contract) => ({
      contractId: contract.contractId,
      contractCode: contract.contractCode,
      courseName: contract.course?.name ?? null,
      batchCode: contract.batch?.batchCode ?? null,
      commercialBasis: contract.commercialBasis as "PER_STUDENT" | "FLAT_COHORT",
      perStudentRateMinor: contract.perStudentRateMinor?.toString() ?? null,
      billableHeadcount: contract.billableHeadcount,
      totalValueMinor: contract.totalValueMinor?.toString() ?? null,
      paidMinor: contract.totalPaidMinor.toString(),
      balanceMinor: contract.balancePendingMinor.toString(),
      status: contract.status,
      signedAt: contract.signedAt?.toISOString() ?? null,
      installments: contract.installments.map((installment) => ({
        installmentId: installment.installmentId,
        installmentNumber: installment.installmentNumber,
        amountMinor: installment.amountMinor.toString(),
        paidAmountMinor: installment.paidAmountMinor.toString(),
        dueDate: installment.dueDate.toISOString().slice(0, 10),
        status: installment.status,
        paidAt: installment.paidAt?.toISOString() ?? null,
        // Decided here, in bigint, rather than on the screen: "past due with
        // something still on it" is a comparison, and a comparison on money is
        // exactly what the portal must never do.
        overdue:
          installment.dueDate < today &&
          installment.amountMinor - installment.paidAmountMinor > 0n,
      })),
    }));

    const totals = await this.billingTotals(collegeId);
    const upcoming = contracts
      .flatMap((contract) =>
        contract.installments
          .filter((i) => i.amountMinor - i.paidAmountMinor > 0n && i.dueDate >= today)
          .map((i) => ({ dueDate: i.dueDate, amount: i.amountMinor - i.paidAmountMinor, code: contract.contractCode })),
      )
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0];

    return {
      ...totals,
      nextDue: upcoming
        ? {
            dueDate: upcoming.dueDate.toISOString().slice(0, 10),
            amountMinor: upcoming.amount.toString(),
            contractCode: upcoming.code,
          }
        : null,
      contracts: rows,
    };
  }

  /**
   * The four figures, summed once.
   *
   * Shared by the home screen and the billing screen deliberately: two copies
   * of "what is outstanding" is how a portal comes to disagree with itself on
   * the one number a bursar will phone about.
   */
  private async billingTotals(collegeId: string) {
    const contracts = await this.prisma.collegeContract.findMany({
      where: { collegeId, deletedAt: null },
      select: {
        totalValueMinor: true,
        totalPaidMinor: true,
        installments: {
          where: { deletedAt: null },
          select: { amountMinor: true, paidAmountMinor: true, dueDate: true },
        },
      },
    });

    const today = startOfToday();
    let billed = 0n;
    let paid = 0n;
    let overdue = 0n;
    for (const contract of contracts) {
      billed += contract.totalValueMinor ?? 0n;
      paid += contract.totalPaidMinor;
      for (const installment of contract.installments) {
        const left = installment.amountMinor - installment.paidAmountMinor;
        if (left > 0n && installment.dueDate < today) overdue += left;
      }
    }
    const outstanding = billed - paid;

    return {
      billedMinor: billed.toString(),
      paidMinor: paid.toString(),
      // Never negative on the screen: an overpayment is a real thing and
      // "-₹2,000 outstanding" is not a sentence anybody reads correctly.
      outstandingMinor: (outstanding > 0n ? outstanding : 0n).toString(),
      overdueMinor: overdue.toString(),
    };
  }

  /**
   * The catalogue, as an institution may read it.
   *
   * ── Why a college gets a course list and a trainer does not ────────────
   *
   * A trainer needs no catalogue: the course NAME rides on every batch they
   * teach, so the module was left out of their matrix entirely and there is
   * nothing to forget. A college has to name the course it is ASKING for, which
   * is a list it cannot do without.
   *
   * `courses` is still absent from `COLLEGE_PERMISSIONS`, so `/courses` refuses
   * them and this is the only way in. The reason is one column:
   * `standardMarketValueMinor` is the price we quote from, and in this segment
   * the price is the negotiated contract instead. `CampusCourse` has no field
   * for it — mapped explicitly, so a column added to the model later cannot
   * arrive here by itself.
   */
  async courses(principal: Principal): Promise<CampusCourse[]> {
    // Anchored on the account existing, so a revoked login reads nothing here
    // either. The catalogue itself is not college-specific.
    await this.collegeOf(principal);

    const courses = await this.prisma.course.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: "asc" },
      select: {
        courseId: true,
        courseCode: true,
        name: true,
        category: true,
        durationHours: true,
        durationWeeks: true,
        attendanceFloorPct: true,
      },
    });
    return courses;
  }

  /**
   * The institution this principal acts for, read from their own row.
   *
   * `principal.collegeScope` carries the same id and the services filter by it.
   * This reads the record instead, because the record is the authority: a
   * college account that was revoked between the token being minted and used is
   * already refused by the principal builder, and anchoring on the row keeps
   * that the only place it is decided.
   */
  private async collegeOf(principal: Principal): Promise<string> {
    const user = await this.prisma.collegeUser.findFirst({
      where: { collegeUserId: principal.id, deletedAt: null },
      select: { collegeId: true },
    });
    if (!user) throw ApiException.notFound("College account");
    return user.collegeId;
  }
}

const SESSION_SHAPE = {
  batch: { select: { batchCode: true } },
  topic: { select: { title: true } },
  trainer: { select: { name: true } },
  recording: { select: { recordingId: true } },
  _count: { select: { assignments: true } },
} as const;

type SessionRow = {
  sessionId: string; sessionCode: string; batchId: string; topicId: string | null;
  trainerId: string | null; title: string; sequence: number; scheduledDate: Date;
  startTime: Date; endTime: Date; mode: string; venue: string | null;
  meetingLink: string | null; status: string; cancelReason: string | null;
  rescheduledFrom: Date | null; rescheduleReason: string | null; completedAt: Date | null;
  createdAt: Date; deletedAt: Date | null;
  batch: { batchCode: string };
  topic: { title: string } | null;
  trainer: { name: string } | null;
  recording: { recordingId: string } | null;
  _count: { assignments: number };
};

function toSession(row: SessionRow) {
  return {
    sessionId: row.sessionId,
    sessionCode: row.sessionCode,
    batchId: row.batchId,
    batchCode: row.batch.batchCode,
    topicId: row.topicId,
    topicTitle: row.topic?.title ?? null,
    trainerId: row.trainerId,
    // The trainer's NAME, and nothing else about them. A college is told who is
    // teaching their cohort; what we pay that person is ours.
    trainerName: row.trainer?.name ?? null,
    title: row.title,
    sequence: row.sequence,
    scheduledDate: row.scheduledDate.toISOString().slice(0, 10),
    startTime: row.startTime.toISOString().slice(11, 16),
    endTime: row.endTime.toISOString().slice(11, 16),
    mode: row.mode as "ONLINE" | "OFFLINE" | "HYBRID",
    venue: row.venue,
    meetingLink: row.meetingLink,
    status: row.status as "SCHEDULED" | "LIVE" | "COMPLETED" | "CANCELLED",
    cancelReason: row.cancelReason,
    rescheduledFrom: row.rescheduledFrom?.toISOString() ?? null,
    rescheduleReason: row.rescheduleReason,
    completedAt: row.completedAt?.toISOString() ?? null,
    assignmentCount: row._count.assignments,
    hasRecording: row.recording !== null,
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

const startOfToday = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};
