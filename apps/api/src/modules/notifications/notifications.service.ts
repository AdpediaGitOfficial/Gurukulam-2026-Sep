import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@gurukulam/db";
import type {
  Bell, MarkReadInput, Notification, NotificationQuery, Principal, SweepResult,
} from "@gurukulam/contracts";
import { PrismaService } from "../prisma/prisma.module";
import { liveOnly } from "../../common/scope/scope";
import { listPage, orderBy, paginate } from "../../common/scope/pagination";
import type { Page } from "@gurukulam/contracts";

/**
 * The bell.
 *
 * An admin WORK QUEUE, not a news feed. The whole design follows from one
 * constraint: if it cannot reach zero it will be ignored within a fortnight.
 *
 * So an ACTION_REQUIRED row is never dismissed by hand — it exists exactly as
 * long as its condition does, and the sweep resolves it the moment the
 * condition clears. A dismissable queue is one nobody trusts, because the
 * absence of a row stops meaning the absence of a problem.
 *
 * Rows are grouped by SITUATION rather than by record: nine unallocated
 * students are one row saying nine, not nine rows saying one.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Emitted ─────────────────────────────────────────────────────────────

  /**
   * One event, for one person, at the moment it happened.
   *
   * ── Why this is not the sweep ──────────────────────────────────────────
   *
   * `sweep()` evaluates SITUATIONS — "how many students are unallocated" — and
   * its design goal is to reach zero. "Your Tuesday session was cancelled" is
   * not a situation. It cannot be swept for, because by the time the nightly
   * run happens the row simply says CANCELLED and nothing records that it
   * CHANGED, or that this person has not been told. And it must never
   * auto-resolve: there is no condition to clear, and a cancellation notice
   * that vanished on its own would be the worst behaviour available.
   *
   * ── Why the input has no `groupKey` ────────────────────────────────────
   *
   * Because the sweep resolves rows BY group key. An emitted row that borrowed
   * one would be silently resolved by the next nightly run — the notice would
   * disappear and nobody would ever know it had. Leaving the field off the
   * input type is what makes that unwritable rather than merely discouraged.
   *
   * ── Why it takes a transaction ─────────────────────────────────────────
   *
   * The event and the change are one fact. Emitting after the transaction
   * commits means a crash in between leaves a cancelled session nobody was
   * told about; emitting inside it means the notice exists if and only if the
   * change does.
   */
  async emit(tx: Prisma.TransactionClient, event: EmittedEvent): Promise<void> {
    await tx.notification.create({
      data: {
        type: event.type,
        class: event.class,
        title: event.title,
        body: event.body ?? null,
        ctaLabel: event.ctaLabel ?? null,
        ctaHref: event.ctaHref ?? null,
        recipientType: event.recipientType,
        recipientId: event.recipientId,
        subjectType: event.subjectType ?? null,
        subjectId: event.subjectId ?? null,
        // Never a group key. See above.
        groupKey: null,
        status: "OPEN",
      },
    });
  }

  /**
   * The same event to every student on a batch's live roster.
   *
   * ── Who counts as on the roster ────────────────────────────────────────
   *
   * A live mapping that is still active. Someone who left the batch is not
   * told that next Tuesday moved — they are not coming — and a deallocated
   * mapping is the admin saying they were never on it.
   *
   * Written as one `createMany` rather than a loop of creates: a roster of
   * forty students is forty rows, and forty round trips inside a transaction
   * is how a session edit starts timing out.
   */
  async emitToRoster(
    tx: Prisma.TransactionClient,
    batchId: string,
    event: Omit<EmittedEvent, "recipientType" | "recipientId">,
  ): Promise<number> {
    const roster = await tx.studentBatchMapping.findMany({
      where: { batchId, deletedAt: null, isActive: true },
      select: { studentId: true },
    });
    if (roster.length === 0) return 0;

    await tx.notification.createMany({
      data: roster.map((row) => ({
        type: event.type,
        class: event.class,
        title: event.title,
        body: event.body ?? null,
        ctaLabel: event.ctaLabel ?? null,
        ctaHref: event.ctaHref ?? null,
        recipientType: "STUDENT" as const,
        recipientId: row.studentId,
        subjectType: event.subjectType ?? null,
        subjectId: event.subjectId ?? null,
        groupKey: null,
        status: "OPEN" as const,
      })),
    });
    return roster.length;
  }

  async list(principal: Principal, query: NotificationQuery): Promise<Page<Notification>> {
    const where: Prisma.NotificationWhereInput = {
      ...this.audienceOf(principal),
      ...(query.class ? { class: query.class } : {}),
      ...(query.status ? { status: query.status } : { status: { not: "RESOLVED" } }),
    };

    return listPage(query, async () => {
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.notification.findMany({
          where,
          orderBy: orderBy(query, ["createdAt", "class"] as const, "createdAt", "notificationId"),
          ...paginate(query),
        }),
        this.prisma.notification.count({ where }),
      ]);
      return [rows.map(toNotification), total];
    });
  }

  /** What the bell renders. */
  async bell(principal: Principal): Promise<Bell> {
    const audience = this.audienceOf(principal);
    const open: Prisma.NotificationWhereInput = { ...audience, status: { not: "RESOLVED" } };

    const [actionRequired, alerts, fyi, items] = await Promise.all([
      this.prisma.notification.count({ where: { ...open, class: "ACTION_REQUIRED" } }),
      this.prisma.notification.count({ where: { ...open, class: "ALERT", status: "OPEN" } }),
      this.prisma.notification.count({ where: { ...open, class: "FYI" } }),
      this.prisma.notification.findMany({
        where: open,
        // Action first, then alerts, then FYI — the order an operator works in.
        orderBy: [{ class: "asc" }, { createdAt: "desc" }],
        take: 50,
      }),
    ]);

    return {
      // FYI never contributes: a badge that never clears trains people to
      // ignore the badge.
      badge: actionRequired + alerts,
      actionRequired,
      alerts,
      fyi,
      items: items.map(toNotification),
    };
  }

  /**
   * Marks FYI and ALERT rows read. ACTION_REQUIRED is deliberately unaffected
   * — those clear when their condition does, not when someone looks at them.
   */
  async markRead(principal: Principal, input: MarkReadInput): Promise<{ marked: number }> {
    const where: Prisma.NotificationWhereInput = {
      ...this.audienceOf(principal),
      status: "OPEN",
      class: { in: ["FYI", "ALERT"] },
      ...(input.all ? {} : { notificationId: { in: input.notificationIds ?? [] } }),
    };

    const result = await this.prisma.notification.updateMany({
      where,
      data: { status: "READ", readAt: new Date() },
    });
    return { marked: result.count };
  }

  /**
   * Raises and resolves every LIVE action-required situation.
   *
   * Idempotent on purpose: it runs from the nightly cron and can be run again
   * at any time. Each situation is upserted by its group key, so re-running
   * updates the count rather than adding a second row.
   */
  async sweep(): Promise<SweepResult> {
    const situations = await this.evaluate();
    let raised = 0;
    let resolved = 0;
    let unchanged = 0;

    for (const s of situations) {
      const existing = await this.prisma.notification.findFirst({
        where: { groupKey: s.groupKey, status: { not: "RESOLVED" } },
      });

      if (s.count === 0) {
        if (existing) {
          // The condition cleared, so the row goes — nobody dismissed it.
          await this.prisma.notification.update({
            where: { notificationId: existing.notificationId },
            data: { status: "RESOLVED", resolvedAt: new Date() },
          });
          resolved++;
        }
        continue;
      }

      if (existing) {
        if (existing.title === s.title) {
          unchanged++;
        } else {
          // The count moved; update in place rather than adding a row.
          await this.prisma.notification.update({
            where: { notificationId: existing.notificationId },
            data: { title: s.title, body: s.body, status: "OPEN" },
          });
          raised++;
        }
        continue;
      }

      await this.prisma.notification.create({
        data: {
          type: s.type,
          class: "ACTION_REQUIRED",
          title: s.title,
          body: s.body,
          ctaLabel: s.ctaLabel,
          ctaHref: s.ctaHref,
          groupKey: s.groupKey,
          status: "OPEN",
        },
      });
      raised++;
    }

    this.logger.log(`Notification sweep: ${raised} raised, ${resolved} resolved, ${unchanged} unchanged`);
    return { raised, resolved, unchanged };
  }

  /**
   * The two things a student is told about that are CONDITIONS, not events.
   *
   * ── Why these two are swept and the rest are emitted ───────────────────
   *
   * "Your session was cancelled" is a fact about a moment and must never
   * auto-resolve. "You have work due tomorrow and have not handed it in" is
   * the opposite: handing it in is exactly what should make it go away, and
   * that is the work-queue behaviour the sweep already implements. The same
   * holds for "your session is tomorrow" — once tomorrow is today, the row has
   * nothing left to say.
   *
   * ── Why these rows DO carry a group key ────────────────────────────────
   *
   * Because that is how the sweep finds and resolves them. It is keyed per
   * student per subject — `student:<id>:assignment:<id>:due` — so one student
   * handing their work in resolves their row and nobody else's. An emitted row
   * must never borrow a key like this; see `emit`.
   *
   * Idempotent: running it twice in a day updates rather than duplicates, and
   * a condition that has cleared is resolved rather than left behind.
   */
  async sweepStudents(now = new Date()): Promise<SweepResult> {
    const today = startOfDay(now);
    const tomorrow = new Date(today.getTime() + 86_400_000);
    const dayAfter = new Date(today.getTime() + 2 * 86_400_000);

    const wanted = new Map<string, StudentSituation>();

    // ── A session tomorrow ────────────────────────────────────────────────
    const sessions = await this.prisma.batchSession.findMany({
      where: {
        deletedAt: null,
        // Not CANCELLED, and not already delivered. A cancelled session
        // tomorrow is the opposite of a reminder.
        status: { in: ["SCHEDULED", "LIVE"] },
        scheduledDate: { gte: tomorrow, lt: dayAfter },
      },
      select: {
        sessionId: true,
        title: true,
        startTime: true,
        batch: {
          select: {
            batchCode: true,
            studentMappings: {
              where: { deletedAt: null, isActive: true },
              select: { studentId: true },
            },
          },
        },
      },
    });

    for (const session of sessions) {
      for (const { studentId } of session.batch.studentMappings) {
        const key = `student:${studentId}:session:${session.sessionId}:tomorrow`;
        wanted.set(key, {
          groupKey: key,
          type: "session.tomorrow",
          class: "FYI",
          title: `${session.title} is tomorrow`,
          body: `${session.batch.batchCode} at ${session.startTime.toISOString().slice(11, 16)}.`,
          ctaLabel: "See the schedule",
          ctaHref: "/portal/learning",
          recipientId: studentId,
          subjectType: "session",
          subjectId: session.sessionId,
        });
      }
    }

    // ── Work due tomorrow, nothing handed in ──────────────────────────────
    const assignments = await this.prisma.assignment.findMany({
      where: {
        deletedAt: null,
        status: "OPEN",
        dueAt: { gte: tomorrow, lt: dayAfter },
      },
      select: {
        assignmentId: true,
        title: true,
        batch: {
          select: {
            batchCode: true,
            studentMappings: {
              where: { deletedAt: null, isActive: true },
              select: { studentId: true },
            },
          },
        },
        submissions: {
          where: { deletedAt: null, submittedAt: { not: null } },
          select: { studentId: true },
        },
      },
    });

    for (const assignment of assignments) {
      // `submittedAt`, not `status`: a PENDING row with no timestamp is work
      // allocated to a student, not work they did.
      const handedIn = new Set(assignment.submissions.map((row) => row.studentId));
      for (const { studentId } of assignment.batch.studentMappings) {
        if (handedIn.has(studentId)) continue;
        const key = `student:${studentId}:assignment:${assignment.assignmentId}:due`;
        wanted.set(key, {
          groupKey: key,
          type: "assignment.due_tomorrow",
          class: "ACTION_REQUIRED",
          title: `${assignment.title} is due tomorrow`,
          body: `${assignment.batch.batchCode}. Nothing handed in yet.`,
          ctaLabel: "Hand it in",
          ctaHref: "/portal/assignments",
          recipientId: studentId,
          subjectType: "assignment",
          subjectId: assignment.assignmentId,
        });
      }
    }

    /*
     * Everything currently raised for a student, so a row whose condition has
     * gone is resolved. Found by the key PREFIX rather than by re-deriving
     * yesterday's conditions — the condition being gone is precisely why it
     * cannot be derived a second time.
     */
    const existing = await this.prisma.notification.findMany({
      where: {
        recipientType: "STUDENT",
        status: { not: "RESOLVED" },
        groupKey: { startsWith: "student:" },
      },
      select: { notificationId: true, groupKey: true, title: true },
    });

    let raised = 0;
    let resolved = 0;
    let unchanged = 0;

    for (const row of existing) {
      const still = row.groupKey === null ? undefined : wanted.get(row.groupKey);
      if (still === undefined) {
        await this.prisma.notification.update({
          where: { notificationId: row.notificationId },
          data: { status: "RESOLVED", resolvedAt: new Date() },
        });
        resolved++;
        continue;
      }
      if (still.title === row.title) unchanged++;
      wanted.delete(row.groupKey!);
    }

    for (const situation of wanted.values()) {
      await this.prisma.notification.create({
        data: {
          type: situation.type,
          class: situation.class,
          title: situation.title,
          body: situation.body,
          ctaLabel: situation.ctaLabel,
          ctaHref: situation.ctaHref,
          recipientType: "STUDENT",
          recipientId: situation.recipientId,
          subjectType: situation.subjectType,
          subjectId: situation.subjectId,
          groupKey: situation.groupKey,
          status: "OPEN",
        },
      });
      raised++;
    }

    this.logger.log(
      `Student sweep: ${raised} raised, ${resolved} resolved, ${unchanged} unchanged`,
    );
    return { raised, resolved, unchanged };
  }

  /**
   * Every LIVE situation, counted.
   *
   * A count of zero is as meaningful as a positive one — it is what resolves
   * an existing row, so each situation must be evaluated on every sweep
   * rather than only when something happens.
   */
  private async evaluate(): Promise<Situation[]> {
    const now = new Date();
    const [
      unallocated, overdue, awaitingApproval, missingRecording,
      unassigned, proposals, requirements, noSchedule, unusedCredentials,
    ] = await Promise.all([
      this.prisma.student.count({
        where: { ...liveOnly(), batchMappings: { none: { deletedAt: null } } },
      }),
      this.prisma.feeInstallment.count({ where: { ...liveOnly(), status: "OVERDUE" } }),
      this.prisma.certificateSubmissionRow.count({
        where: {
          ...liveOnly(), status: "PENDING",
          submission: { deletedAt: null, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
        },
      }),
      this.prisma.batchSession.count({
        where: { ...liveOnly(), status: "COMPLETED", recording: null },
      }),
      this.prisma.batch.count({
        where: { ...liveOnly(), status: { in: ["SCHEDULED", "IN_PROGRESS"] }, primaryTrainerId: null },
      }),
      this.prisma.batchTrainerAssignment.count({ where: { ...liveOnly(), status: "PROPOSED" } }),
      this.prisma.collegeRequirement.count({
        where: { ...liveOnly(), status: { in: ["NEW", "UNDER_REVIEW"] } },
      }),
      this.prisma.studentFeeLedger.count({
        where: { ...liveOnly(), installments: { none: { deletedAt: null } } },
      }),
      this.prisma.student.count({
        where: { ...liveOnly(), credentialsIssuedAt: { not: null, lt: new Date(now.getTime() - 7 * 86_400_000) }, lastLoginAt: null },
      }),
    ]);

    const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

    return [
      {
        type: "students.unallocated", groupKey: "students.unallocated", count: unallocated,
        title: `${unallocated} ${plural(unallocated, "student is", "students are")} awaiting allocation`,
        body: "A record exists but no course, batch or price has been decided — revenue has not started.",
        ctaLabel: "Open the queue", ctaHref: "/students?allocated=false",
      },
      {
        type: "fees.overdue", groupKey: "fees.overdue", count: overdue,
        title: `${overdue} ${plural(overdue, "installment is", "installments are")} overdue`,
        body: "Past the due date and still unpaid. Reminders go to whoever the installment's parent names.",
        ctaLabel: "Open the ledger", ctaHref: "/fee-ledger?overdueOnly=true",
      },
      {
        type: "certificates.awaiting_approval", groupKey: "certificates.awaiting_approval", count: awaitingApproval,
        title: `${awaitingApproval} certificate ${plural(awaitingApproval, "name awaits", "names await")} review`,
        body: "A college uploaded names. An uploaded name is not a certificate until it is approved.",
        ctaLabel: "Review submissions", ctaHref: "/certificates/submissions",
      },
      {
        type: "sessions.missing_recording", groupKey: "sessions.missing_recording", count: missingRecording,
        title: `${missingRecording} completed ${plural(missingRecording, "session has", "sessions have")} no recording`,
        body: "Marking a session complete prompts for the recording; these were never linked.",
        ctaLabel: "Open sessions", ctaHref: "/batches/sessions?status=COMPLETED",
      },
      {
        type: "batches.unassigned", groupKey: "batches.unassigned", count: unassigned,
        title: `${unassigned} ${plural(unassigned, "batch has", "batches have")} no confirmed trainer`,
        body: "Scheduled delivery with nobody committed to teach it.",
        ctaLabel: "Open batches", ctaHref: "/batches?status=SCHEDULED",
      },
      {
        type: "trainers.proposal_pending", groupKey: "trainers.proposal_pending", count: proposals,
        title: `${proposals} trainer ${plural(proposals, "proposal awaits", "proposals await")} a response`,
        body: "A proposal is not committed delivery until the trainer confirms.",
        ctaLabel: "Open the calendar", ctaHref: "/trainers/calendar",
      },
      {
        type: "requirements.awaiting_review", groupKey: "requirements.awaiting_review", count: requirements,
        title: `${requirements} college ${plural(requirements, "requirement awaits", "requirements await")} review`,
        body: "An institution has asked for training and nobody has responded yet.",
        ctaLabel: "Open requirements", ctaHref: "/colleges/requirements",
      },
      {
        type: "ledgers.no_schedule", groupKey: "ledgers.no_schedule", count: noSchedule,
        title: `${noSchedule} ${plural(noSchedule, "ledger has", "ledgers have")} no installment schedule`,
        body: "A balance exists but nothing will ever fall due against it.",
        ctaLabel: "Open the ledger", ctaHref: "/fee-ledger",
      },
      {
        type: "credentials.unused", groupKey: "credentials.unused", count: unusedCredentials,
        title: `${unusedCredentials} issued ${plural(unusedCredentials, "credential has", "credentials have")} never been used`,
        body: "Issued more than a week ago and never signed in with — often a welcome pack that never arrived.",
        ctaLabel: "Open students", ctaHref: "/students",
      },
    ];
  }

  /**
   * Which rows this principal sees.
   *
   * Scoped like any other query. A row addressed to nobody in particular is a
   * system-wide situation and reaches every operator whose scope matches; a
   * row naming a recipient reaches only them.
   */
  private audienceOf(principal: Principal): Prisma.NotificationWhereInput {
    return {
      OR: [
        { recipientId: null, recipientType: null },
        { recipientType: principal.actor, recipientId: principal.id },
      ],
      ...(principal.collegeScope !== null
        ? { OR: [{ collegeId: principal.collegeScope }, { collegeId: null, recipientId: principal.id }] }
        : {}),
      ...(principal.cityScope !== null
        ? { AND: [{ OR: [{ cityId: { in: principal.cityScope } }, { cityId: null }] }] }
        : {}),
    };
  }
}

/**
 * What an emitted event carries.
 *
 * Deliberately WITHOUT `groupKey` and without `status`. The first would let an
 * event be resolved by the sweep; the second would let a caller write one that
 * arrives already read. Both are mistakes that no test would catch, so the
 * type simply cannot express them.
 */
export interface EmittedEvent {
  /** A key from the catalogue, e.g. "session.cancelled". */
  type: string;
  class: "ACTION_REQUIRED" | "ALERT" | "FYI";
  title: string;
  body?: string;
  ctaLabel?: string;
  ctaHref?: string;
  recipientType: "STUDENT" | "ADMIN_USER" | "COLLEGE_USER" | "TRAINER";
  recipientId: string;
  subjectType?: string;
  subjectId?: string;
}

interface StudentSituation {
  groupKey: string;
  type: string;
  class: "ACTION_REQUIRED" | "FYI";
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  recipientId: string;
  subjectType: string;
  subjectId: string;
}

interface Situation {
  type: string;
  groupKey: string;
  count: number;
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
}

function toNotification(row: {
  notificationId: string; type: string; class: string; title: string; body: string | null;
  ctaLabel: string | null; ctaHref: string | null; subjectType: string | null;
  subjectId: string | null; groupKey: string | null; status: string;
  readAt: Date | null; resolvedAt: Date | null; createdAt: Date;
}): Notification {
  return {
    notificationId: row.notificationId,
    type: row.type,
    class: row.class as Notification["class"],
    title: row.title,
    body: row.body,
    ctaLabel: row.ctaLabel,
    ctaHref: row.ctaHref,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    groupKey: row.groupKey,
    status: row.status as Notification["status"],
    readAt: row.readAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

const startOfDay = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
