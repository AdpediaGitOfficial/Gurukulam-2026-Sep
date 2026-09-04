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
          orderBy: orderBy(query, ["createdAt", "class"] as const, "createdAt"),
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
