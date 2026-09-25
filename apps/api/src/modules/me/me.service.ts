import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  MeAssignment,
  MeAssignments,
  MeBatch,
  MeFees,
  MeHome,
  MeInstallment,
  MeLedger,
  MeProfile,
  MeSchedule,
  MeSession,
  MeSubmission,
  Principal,
  SubmitAssignmentInput,
  UpdateMeInput,
} from "@gurukulam/contracts";
import { toWire } from "@gurukulam/contracts";
import { PrismaService } from "../prisma/prisma.module";
import { ApiException } from "../../common/errors";

/**
 * The student's own surface.
 *
 * ── Why this is a module and not a scope on the admin endpoints ─────────
 *
 * A student principal has `cityScope: null` and `collegeScope: null`, and in
 * this codebase null means GLOBAL. They are kept out of the admin surface by
 * holding no permissions at all — which fails closed, and is right — but it
 * means the college portal's approach, handing the same endpoints a narrower
 * scope, cannot work here.
 *
 * The alternative would be a third scope axis and a per-actor projection
 * inside the admin mappers. That is how a field escapes: the projection is one
 * `if` away from being wrong and nothing fails when it is. Here, `notes`,
 * `suspendedReason`, `createdBy` and the ledger's internals never enter the
 * function.
 *
 * ── The one rule every read here shares ─────────────────────────────────
 *
 * Every query is anchored to `principal.id` and never to an id from the
 * request. There is no `studentId` parameter anywhere in this service, so
 * there is nothing for a caller to tamper with — the scope is structural
 * rather than checked.
 */
@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Profile ─────────────────────────────────────────────────────────────

  async profile(principal: Principal): Promise<MeProfile> {
    const student = await this.prisma.student.findFirst({
      where: { studentId: principal.id, deletedAt: null },
      include: { college: { select: { name: true } }, city: { select: { name: true } } },
    });
    if (!student) throw ApiException.notFound("Student");

    return {
      studentId: student.studentId,
      studentCode: student.studentCode,
      firstName: student.firstName,
      lastName: student.lastName,
      email: student.email,
      loginEmail: student.loginEmail,
      phone: student.phone,
      altPhone: student.altPhone,
      addressLine1: student.addressLine1,
      addressLine2: student.addressLine2,
      postalCode: student.postalCode,
      cityName: student.city?.name ?? null,
      discipline: student.discipline,
      passoutYear: student.passoutYear,
      photoUrl: student.photoUrl,
      // Derived, never stored: a student with no college is retail and always
      // will be (invariant 1).
      segment: student.collegeId === null ? "RETAIL" : "COLLEGE",
      collegeName: student.college?.name ?? null,
      enrolledOn: student.createdAt.toISOString(),
    };
  }

  /**
   * The narrow edit.
   *
   * The field list is the contract's, not a spread of the request: a key that
   * is not named here cannot be written, whatever arrives in the body. An
   * empty string clears the column — that is a person deleting their alternate
   * number, which is a real thing to want, and distinct from omitting the key.
   */
  async updateProfile(principal: Principal, input: UpdateMeInput): Promise<MeProfile> {
    const student = await this.prisma.student.findFirst({
      where: { studentId: principal.id, deletedAt: null },
      select: { studentId: true },
    });
    if (!student) throw ApiException.notFound("Student");

    const text = (value: string | undefined): string | null | undefined =>
      value === undefined ? undefined : value.trim() === "" ? null : value.trim();

    await this.prisma.student.update({
      where: { studentId: principal.id },
      data: {
        phone: text(input.phone),
        altPhone: text(input.altPhone),
        addressLine1: text(input.addressLine1),
        addressLine2: text(input.addressLine2),
        postalCode: text(input.postalCode),
      },
    });

    return this.profile(principal);
  }

  // ── My learning ─────────────────────────────────────────────────────────

  /**
   * The batches this student sits on, finished ones included.
   *
   * A completed or exited enrolment still shows: the batch they finished is
   * how they explain the certificate they hold, and a roster they left is part
   * of their own history. Only a DEALLOCATED mapping disappears — that is the
   * admin saying they should never have been on it at all.
   */
  async batches(principal: Principal): Promise<MeBatch[]> {
    const mappings = await this.prisma.studentBatchMapping.findMany({
      where: { studentId: principal.id, deletedAt: null },
      include: {
        batch: {
          include: {
            course: { select: { name: true } },
            primaryTrainer: { select: { name: true } },
            _count: { select: { sessions: { where: { deletedAt: null } } } },
          },
        },
      },
      orderBy: { enrolledAt: "desc" },
    });

    const batchIds = mappings.map((m) => m.batchId);
    const delivered = await this.prisma.batchSession.groupBy({
      by: ["batchId"],
      where: { batchId: { in: batchIds }, deletedAt: null, status: "COMPLETED" },
      _count: { _all: true },
    });
    const deliveredBy = new Map(delivered.map((row) => [row.batchId, row._count._all]));

    return mappings.map((m) => ({
      batchId: m.batchId,
      batchCode: m.batch.batchCode,
      name: m.batch.name,
      courseName: m.batch.course?.name ?? null,
      mode: m.batch.mode,
      startDate: m.batch.startDate.toISOString().slice(0, 10),
      endDate: m.batch.endDate?.toISOString().slice(0, 10) ?? null,
      trainerName: m.batch.primaryTrainer?.name ?? null,
      venue: m.batch.venue,
      enrolledAt: m.enrolledAt.toISOString(),
      // Completion and exit are independent flags on the mapping, not one
      // status, because a batch can end both ways for different people.
      outcome: m.completedAt !== null ? "COMPLETED" : m.isActive ? "ACTIVE" : "LEFT",
      completedAt: m.completedAt?.toISOString() ?? null,
      sessionCount: m.batch._count.sessions,
      deliveredCount: deliveredBy.get(m.batchId) ?? 0,
    }));
  }

  /**
   * Every session on every batch of theirs, split into what is still to come
   * and what has already happened.
   *
   * ── The two gates on a recording ────────────────────────────────────────
   *
   * A recording appears only when its session is COMPLETED **and** the
   * recording is published. Both gates already exist in the schema, and the
   * first is invariant 10's shape: a link attached to a session nobody has
   * marked delivered is either a mistake or a promise the system cannot keep,
   * and the portal is not the place that ordering is first broken.
   */
  async schedule(principal: Principal): Promise<MeSchedule> {
    const mappings = await this.prisma.studentBatchMapping.findMany({
      where: { studentId: principal.id, deletedAt: null },
      select: { batchId: true },
    });
    const batchIds = mappings.map((m) => m.batchId);
    if (batchIds.length === 0) return { upcoming: [], past: [] };

    const rows = await this.prisma.batchSession.findMany({
      where: { batchId: { in: batchIds }, deletedAt: null },
      include: {
        batch: { select: { batchCode: true, course: { select: { name: true } } } },
        topic: { select: { title: true } },
        trainer: { select: { name: true } },
        recording: true,
      },
      orderBy: [{ scheduledDate: "asc" }, { startTime: "asc" }],
    });

    // Compared against the START OF TODAY, not `now()`: `scheduledDate` is a
    // DATE column, so a session earlier this morning is still today's class
    // and belongs with what is coming rather than with history.
    const today = startOfToday();

    const upcoming: MeSession[] = [];
    const past: MeSession[] = [];
    for (const row of rows) {
      const session = toSession(row);
      if (row.scheduledDate >= today && row.status !== "COMPLETED") upcoming.push(session);
      else past.push(session);
    }
    // History reads newest first; what is coming reads soonest first.
    past.reverse();

    return { upcoming, past };
  }

  // ── My fees ─────────────────────────────────────────────────────────────

  /**
   * What this student owes, and what they have paid.
   *
   * ── Invariant 3 is answered before any money is ────────────────────────
   *
   * Billing follows segment. A college student is billed through their
   * institution's contract and has no ledger of their own — so this returns
   * `billedToCollege` and an EMPTY list, and the screen renders an explanation
   * rather than a total of zero. Those are different sentences: one says
   * nothing is owed yet, the other says it will never be theirs to owe.
   *
   * The query is still anchored to `principal.id`, so even a mistake here
   * cannot reach another student's ledger.
   *
   * ── Why `overdue` is computed rather than read ─────────────────────────
   *
   * `status` only moves to OVERDUE when the nightly run touches the row. A
   * student looking the morning after a missed date would be told their
   * instalment is still pending, which is worse than silence. Past its date
   * with money still owed is overdue, and that is decided at read time.
   */
  async fees(principal: Principal): Promise<MeFees> {
    const student = await this.prisma.student.findFirst({
      where: { studentId: principal.id, deletedAt: null },
      include: { college: { select: { name: true } } },
    });
    if (!student) throw ApiException.notFound("Student");

    const zero = toWire(0n);
    if (student.collegeId !== null) {
      return {
        billedToCollege: true,
        collegeName: student.college?.name ?? null,
        ledgers: [],
        totalPayableMinor: zero,
        totalPaidMinor: zero,
        totalOutstandingMinor: zero,
        nextDue: null,
        overdueCount: 0,
      };
    }

    const rows = await this.prisma.studentFeeLedger.findMany({
      where: { studentId: principal.id, deletedAt: null },
      include: {
        course: { select: { name: true } },
        batch: { select: { batchCode: true } },
        installments: {
          where: { deletedAt: null },
          orderBy: { installmentNumber: "asc" },
          include: {
            transactions: {
              where: { deletedAt: null },
              orderBy: { paidAt: "asc" },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const today = startOfToday();
    const ledgers: MeLedger[] = rows.map((row) => ({
      ledgerId: row.ledgerId,
      courseName: row.course?.name ?? null,
      batchCode: row.batch?.batchCode ?? null,
      enrolmentValueMinor: toWire(row.enrolmentValueMinor),
      paidMinor: toWire(row.totalPaidMinor),
      outstandingMinor: toWire(row.balancePendingMinor),
      installments: row.installments.map((i) => toInstallment(i, today)),
    }));

    // Summed as bigint. A float here would be wrong by paise on a real
    // schedule, and wrong in a way nobody notices until a reconciliation.
    let payable = 0n;
    let paid = 0n;
    let outstanding = 0n;
    for (const row of rows) {
      payable += row.enrolmentValueMinor;
      paid += row.totalPaidMinor;
      outstanding += row.balancePendingMinor;
    }

    /*
     * The next thing to pay: the earliest instalment still carrying money,
     * across every enrolment. An overdue one sorts first whatever its date,
     * because "what do I owe now" is answered by the oldest miss, not by the
     * nearest deadline.
     */
    const open = ledgers
      .flatMap((ledger) =>
        ledger.installments
          .filter((i) => BigInt(i.outstandingMinor) > 0n)
          .map((i) => ({ ledger, installment: i })),
      )
      .sort((a, b) => a.installment.dueDate.localeCompare(b.installment.dueDate));

    const first = open[0];
    const overdueCount = open.filter((entry) => entry.installment.overdue).length;

    return {
      billedToCollege: false,
      collegeName: null,
      ledgers,
      totalPayableMinor: toWire(payable),
      totalPaidMinor: toWire(paid),
      totalOutstandingMinor: toWire(outstanding),
      nextDue:
        first === undefined
          ? null
          : {
              installmentId: first.installment.installmentId,
              courseName: first.ledger.courseName,
              installmentNumber: first.installment.installmentNumber,
              totalInstallments: first.ledger.installments.length,
              amountMinor: first.installment.amountMinor,
              outstandingMinor: first.installment.outstandingMinor,
              dueDate: first.installment.dueDate,
              overdue: first.installment.overdue,
            },
      overdueCount,
    };
  }

  // ── My assignments ──────────────────────────────────────────────────────

  /**
   * The work set against this student's batches, and what they handed in.
   *
   * ── Which assignments exist, as far as a student is concerned ───────────
   *
   * Only those on a batch they hold a live mapping to — the same anchor every
   * read here uses, so there is no batch id to tamper with.
   *
   * DRAFT is invisible. An assignment nobody has published is one the trainer
   * is still writing, and showing it sets work that has not been set. OPEN and
   * CLOSED are both visible: closing stops submission, it does not erase what
   * was asked. A list that quietly shortened would leave a student unable to
   * tell "I did everything" from "I never saw it".
   *
   * ── Why the split happens here ─────────────────────────────────────────
   *
   * Three states, three sentences: still to do, waiting to be marked, and the
   * window closed with nothing in. Deciding that in the service means one
   * definition of "handed in" rather than one per screen — and the definition
   * is `submittedAt`, not `status`, because a PENDING row with no timestamp is
   * an assignment allocated to a student rather than work they did.
   */
  async assignments(principal: Principal): Promise<MeAssignments> {
    const mappings = await this.prisma.studentBatchMapping.findMany({
      where: { studentId: principal.id, deletedAt: null },
      select: { batchId: true },
    });
    const batchIds = mappings.map((m) => m.batchId);
    if (batchIds.length === 0) return { outstanding: [], submitted: [], missed: [] };

    const rows = await this.prisma.assignment.findMany({
      where: {
        batchId: { in: batchIds },
        deletedAt: null,
        // DRAFT withheld. See above.
        status: { in: ["OPEN", "CLOSED"] },
      },
      include: {
        batch: { select: { batchCode: true, course: { select: { name: true } } } },
        session: { select: { title: true } },
        // Scoped to THIS student inside the include, so another student's
        // submission cannot arrive here even as a row that is later dropped.
        submissions: {
          where: { studentId: principal.id, deletedAt: null },
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
      orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
    });

    /*
     * The START of today, not `now()`.
     *
     * `due_at` is a DateTime column, but the console collects it from a DATE
     * input, so every value in it is midnight UTC on a calendar day. Compared
     * against an instant, an assignment due today is already overdue at one
     * minute past midnight — a student is owed the day they were given.
     */
    const today = startOfToday();
    const outstanding: MeAssignment[] = [];
    const submitted: MeAssignment[] = [];
    const missed: MeAssignment[] = [];

    for (const row of rows) {
      const assignment = toAssignment(row, today);
      if (assignment.submission?.submittedAt != null) submitted.push(assignment);
      else if (assignment.open) outstanding.push(assignment);
      else missed.push(assignment);
    }

    // What is due reads soonest first — Prisma's `nulls: last` on `dueAt` is
    // not expressible alongside a second key here, so an undated assignment is
    // pushed to the end of its own list rather than leading it with no date.
    const undatedLast = (a: MeAssignment, b: MeAssignment): number =>
      a.dueAt === b.dueAt ? 0 : a.dueAt === null ? 1 : b.dueAt === null ? -1 : 0;
    outstanding.sort(undatedLast);
    // History reads newest first, the same way the schedule's past does.
    submitted.reverse();
    missed.reverse();

    return { outstanding, submitted, missed };
  }

  /**
   * Handing work in.
   *
   * The first WRITE a student makes in this product, and the first place the
   * `/me` surface has to refuse something rather than simply answer.
   *
   * ── Why every refusal here is a 404 except the two that are not ─────────
   *
   * An assignment on somebody else's batch, a deleted one, and a DRAFT one all
   * read "not found": a student may not learn that a piece of work exists by
   * being told they are not allowed to submit to it. CLOSED and already-marked
   * are conflicts, because those are assignments they can see on their own
   * screen — a 404 there would read as a fault in the page.
   *
   * ── Why a re-submission is allowed, and where it stops ─────────────────
   *
   * A student who pasted the wrong link needs to fix it, and an assignment
   * that is still open has not been judged yet. So a hand-in replaces the
   * previous one while the assignment is OPEN and nothing has been marked. It
   * stops dead at GRADED: silently changing work a trainer has already put a
   * mark against would make the mark a statement about something that is no
   * longer there.
   *
   * `submittedAt` moves to the latest hand-in rather than staying at the
   * first, because lateness is a fact about the work being assessed, and the
   * work being assessed is the one that is there now.
   */
  async submitAssignment(
    principal: Principal,
    assignmentId: string,
    input: SubmitAssignmentInput,
  ): Promise<MeAssignment> {
    const row = await this.prisma.assignment.findFirst({
      where: {
        assignmentId,
        deletedAt: null,
        status: { in: ["OPEN", "CLOSED"] },
        // The scope, as a join rather than a check: an assignment on a batch
        // this student is not mapped to does not match, so there is no
        // authorisation step for a later handler to forget.
        batch: { studentMappings: { some: { studentId: principal.id, deletedAt: null } } },
      },
      select: { assignmentId: true, status: true, dueAt: true },
    });
    if (!row) throw ApiException.notFound("Assignment");

    if (row.status !== "OPEN") {
      throw ApiException.conflict(
        "This assignment is closed for submission. Speak to your trainer if you still need to hand it in.",
      );
    }

    const existing = await this.prisma.assignmentSubmission.findFirst({
      where: { assignmentId, studentId: principal.id, deletedAt: null },
      select: { submissionId: true, status: true },
    });
    if (existing?.status === "GRADED") {
      throw ApiException.conflict(
        "Your work has already been marked, so it cannot be replaced. Speak to your trainer.",
      );
    }

    const fileUrl = blank(input.fileUrl);
    const contentText = blank(input.contentText);
    const now = new Date();
    /*
     * LATE is recorded rather than derived, because it is the TRAINER's input:
     * they open a list and need to see which hand-ins arrived after the date
     * without recomputing it against a due date an admin may since have moved.
     *
     * Judged on the DAY, for the reason `assignments` records: a due date is a
     * calendar day here, so work handed in during that day is on time.
     */
    const status = row.dueAt !== null && startOfToday() > row.dueAt ? "LATE" : "SUBMITTED";

    if (existing) {
      await this.prisma.assignmentSubmission.update({
        where: { submissionId: existing.submissionId },
        data: { fileUrl, contentText, status, submittedAt: now },
      });
    } else {
      try {
        await this.prisma.assignmentSubmission.create({
          data: {
            assignmentId,
            studentId: principal.id,
            fileUrl,
            contentText,
            status,
            submittedAt: now,
            createdBy: principal.id,
          },
        });
      } catch (error) {
        /*
         * The double tap. Two requests both read "no submission yet" and both
         * insert; the partial unique index tells the second it lost. Reported
         * as a conflict rather than a 500, because the student's work IS in —
         * theirs was the request that arrived second, not the one that failed.
         */
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw ApiException.conflict("Your work is already in. Reload the page to see it.");
        }
        throw error;
      }
    }

    const saved = await this.prisma.assignment.findFirstOrThrow({
      where: { assignmentId },
      include: {
        batch: { select: { batchCode: true, course: { select: { name: true } } } },
        session: { select: { title: true } },
        submissions: {
          where: { studentId: principal.id, deletedAt: null },
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
    });
    return toAssignment(saved, startOfToday());
  }

  /**
   * The landing page.
   *
   * Three answers, not a dashboard of metrics: a student has no fleet to
   * survey. When is my next session, what am I on, and what can I catch up on.
   */
  async home(principal: Principal): Promise<MeHome> {
    const [profile, batches, schedule, assignments] = await Promise.all([
      this.profile(principal),
      this.batches(principal),
      this.schedule(principal),
      this.assignments(principal),
    ]);

    return {
      firstName: profile.firstName,
      segment: profile.segment,
      nextSession: schedule.upcoming[0] ?? null,
      activeBatches: batches.filter((b) => b.outcome === "ACTIVE").length,
      completedBatches: batches.filter((b) => b.outcome === "COMPLETED").length,
      deliveredSessions: schedule.past.filter((s) => s.status === "COMPLETED").length,
      availableRecordings: schedule.past.filter((s) => s.recording !== null).length,
      // Already sorted soonest-first by `assignments`, so the head of the list
      // IS the next thing to do. Missed work is deliberately not counted here:
      // the home page's job is what to do next, and nothing can be done about
      // an assignment whose window has closed.
      nextAssignment: assignments.outstanding[0] ?? null,
      assignmentsDue: assignments.outstanding.length,
    };
  }
}

type InstallmentRow = {
  installmentId: string;
  installmentNumber: number;
  amountMinor: bigint;
  paidAmountMinor: bigint;
  dueDate: Date;
  status: MeInstallment["status"];
  transactions: {
    transactionId: string;
    transactionCode: string;
    amountMinor: bigint;
    paidAt: Date;
    paymentMode: string;
    isReversal: boolean;
    receiptNumber: string | null;
  }[];
};

function toInstallment(row: InstallmentRow, today: Date): MeInstallment {
  // Clamped at zero: an overpayment is a real thing on a real schedule, and
  // "you owe minus two hundred rupees" is not a sentence to show anybody.
  const owed = row.amountMinor - row.paidAmountMinor;
  const outstanding = owed > 0n ? owed : 0n;

  return {
    installmentId: row.installmentId,
    installmentNumber: row.installmentNumber,
    amountMinor: toWire(row.amountMinor),
    paidAmountMinor: toWire(row.paidAmountMinor),
    outstandingMinor: toWire(outstanding),
    dueDate: row.dueDate.toISOString().slice(0, 10),
    status: row.status,
    // Read time, not stored: see the note on `fees`.
    overdue: outstanding > 0n && row.dueDate < today,
    payments: row.transactions.map((t) => ({
      transactionId: t.transactionId,
      transactionCode: t.transactionCode,
      amountMinor: toWire(t.amountMinor),
      paidAt: t.paidAt.toISOString(),
      paymentMode: t.paymentMode,
      isReversal: t.isReversal,
      receiptNumber: t.receiptNumber,
    })),
  };
}

type SessionRow = {
  sessionId: string;
  sessionCode: string;
  title: string;
  batchId: string;
  scheduledDate: Date;
  startTime: Date;
  endTime: Date;
  mode: MeSession["mode"];
  venue: string | null;
  meetingLink: string | null;
  status: MeSession["status"];
  cancelReason: string | null;
  rescheduledFrom: Date | null;
  batch: { batchCode: string; course: { name: string } | null };
  topic: { title: string } | null;
  trainer: { name: string } | null;
  recording: { url: string; title: string | null; provider: string; isPublished: boolean } | null;
};

function toSession(row: SessionRow): MeSession {
  return {
    sessionId: row.sessionId,
    sessionCode: row.sessionCode,
    title: row.title,
    batchId: row.batchId,
    batchCode: row.batch.batchCode,
    courseName: row.batch.course?.name ?? null,
    topicTitle: row.topic?.title ?? null,
    trainerName: row.trainer?.name ?? null,
    scheduledDate: row.scheduledDate.toISOString().slice(0, 10),
    startTime: row.startTime.toISOString().slice(11, 16),
    endTime: row.endTime.toISOString().slice(11, 16),
    mode: row.mode,
    venue: row.venue,
    meetingLink: row.meetingLink,
    status: row.status,
    cancelReason: row.cancelReason,
    rescheduledFrom: row.rescheduledFrom?.toISOString() ?? null,
    // Both gates, in one expression, so neither can be applied without the
    // other: delivered, and published.
    recording:
      row.status === "COMPLETED" && row.recording !== null && row.recording.isPublished
        ? {
            url: row.recording.url,
            title: row.recording.title,
            provider: row.recording.provider,
          }
        : null,
  };
}

type SubmissionRow = {
  submissionId: string;
  status: MeSubmission["status"];
  submittedAt: Date | null;
  fileUrl: string | null;
  contentText: string | null;
  marksAwarded: number | null;
  feedback: string | null;
  gradedAt: Date | null;
};

type AssignmentRow = {
  assignmentId: string;
  assignmentCode: string;
  title: string;
  description: string | null;
  instructions: string | null;
  attachmentUrl: string | null;
  maxMarks: number | null;
  dueAt: Date | null;
  status: "DRAFT" | "OPEN" | "CLOSED";
  batch: { batchCode: string; course: { name: string } | null };
  session: { title: string } | null;
  submissions: SubmissionRow[];
};

function toAssignment(row: AssignmentRow, today: Date): MeAssignment {
  const submission = row.submissions[0] ?? null;
  const handedIn = submission?.submittedAt != null;

  return {
    assignmentId: row.assignmentId,
    assignmentCode: row.assignmentCode,
    title: row.title,
    description: row.description,
    instructions: row.instructions,
    attachmentUrl: row.attachmentUrl,
    maxMarks: row.maxMarks,
    dueAt: row.dueAt?.toISOString() ?? null,
    batchCode: row.batch.batchCode,
    courseName: row.batch.course?.name ?? null,
    sessionTitle: row.session?.title ?? null,
    open: row.status === "OPEN",
    // Past its date with nothing in. Work already handed in is never overdue,
    // whatever the date says — the student did their part, and `status` carries
    // LATE for the trainer who needs to know it arrived after the deadline.
    overdue: !handedIn && row.dueAt !== null && row.dueAt < today,
    submission:
      submission === null
        ? null
        : {
            submissionId: submission.submissionId,
            status: submission.status,
            submittedAt: submission.submittedAt?.toISOString() ?? null,
            fileUrl: submission.fileUrl,
            contentText: submission.contentText,
            marksAwarded: submission.marksAwarded,
            feedback: submission.feedback,
            gradedAt: submission.gradedAt?.toISOString() ?? null,
          },
  };
}

/** An empty string is a cleared field, not a value. */
const blank = (value: string | undefined): string | null =>
  value === undefined || value.trim() === "" ? null : value.trim();

const startOfToday = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};
