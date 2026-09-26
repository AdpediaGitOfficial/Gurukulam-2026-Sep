import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@gurukulam/db";
import { formatRupees, type CronResult } from "@gurukulam/contracts";
import { PrismaService } from "../prisma/prisma.module";
import { LedgerService } from "./ledger.service";
import { NotificationsService } from "../notifications/notifications.service";

/**
 * The nightly reminder run (architecture.md §6.5). Driven by an EXTERNAL
 * scheduler hitting a route handler behind a shared secret — not an in-process
 * timer, which does not survive serverless and fires once per replica when it
 * does run.
 *
 * Four steps, in this order:
 *   1. the reminder LADDER → a rung to the parent's recipient;
 *   2. installments past due and still pending → OVERDUE, notice dispatched;
 *   3. re-derive every touched parent's status;
 *   4. sweep the operator queue and the two student conditions.
 *
 * Every recipient is resolved from the installment's PARENT (invariant 6).
 * That is the whole reason a college's students never receive an invoice
 * reminder: there is no stored recipient column to be wrong, and a college
 * installment resolves to the COLLEGE. A college student has no ledger and no
 * dues — a reminder would be telling them about somebody else's invoice.
 */
@Injectable()
export class ReminderCronService {
  private readonly logger = new Logger(ReminderCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly notifications: NotificationsService,
  ) {}

  async run(now = new Date()): Promise<CronResult> {
    const remindersDue = await this.climbTheLadder(now);
    const markedOverdue = await this.markOverdue(now);
    const parentsRederived = await this.rederiveParents();

    // Swept AFTER the overdue transition, so a newly overdue installment is
    // counted by the notification raised in the same run rather than waiting
    // a day. An action-required row exists exactly as long as its condition
    // does, so this is also what RESOLVES the ones that cleared.
    await this.notifications.sweep();
    // And the student side: a session tomorrow, work due tomorrow. Both are
    // conditions rather than events, which is why they are swept — handing the
    // work in is what makes the row go away.
    await this.notifications.sweepStudents(now);

    this.logger.log(
      `Reminder run: ${remindersDue} reminders, ${markedOverdue} newly overdue, ` +
        `${parentsRederived} parents re-derived`,
    );
    return { remindersDue, markedOverdue, parentsRederived };
  }

  /**
   * Step 1 — the ladder.
   *
   * ── Why a table and not a flag ─────────────────────────────────────────
   *
   * `reminder_sent_flag` is a boolean, so it can record that SOMETHING went
   * out and nothing else. A ladder has to know which rungs have been climbed,
   * and finance has to be able to answer "did we remind them, and when".
   *
   * `fee_installment_reminders` is keyed on (installment, offset), and that
   * key is what makes this idempotent: running the cron twice in a day cannot
   * double-send, because the second insert for the same rung loses. A stage
   * counter on the installment would not give that — two runs could each read
   * the same stage and each advance it.
   *
   * ── Why it climbs ONE rung, not every rung it has passed ───────────────
   *
   * An earlier version sent every rung an installment had reached and not yet
   * had. On a clean schedule that is the same thing; against real data it sent
   * 9,968 reminders on its first run, because an installment a year overdue
   * has fifty weekly rungs behind it and they all came due at once.
   *
   * It was also saying the wrong thing. If the run misses two days and an
   * installment crosses the 5-day and 3-day rungs, sending both means telling
   * somebody "due in five days" about a bill due in three. The rung that
   * matters is the LATEST one reached — which is exactly the one a missed day
   * would otherwise skip, so nothing is lost by dropping the rest.
   *
   * Nothing is recorded for the rungs that are skipped, because the table says
   * what was SENT. A row claiming a reminder nobody received would be worse
   * than a gap, since the question it exists to answer is finance's.
   */
  private async climbTheLadder(now: Date): Promise<number> {
    const today = startOfDay(now);

    const open = await this.prisma.feeInstallment.findMany({
      where: {
        deletedAt: null,
        /*
         * OVERDUE belongs here, and leaving it out made the ladder's own
         * overdue rungs unreachable.
         *
         * Step 2 moves a past-due installment to OVERDUE. On the first day it
         * is still PENDING when the ladder runs, so rung 0 fires — and from
         * the next day it is OVERDUE, so a filter of PENDING/PARTIALLY_PAID
         * silently drops the very rows the -3, -7 and weekly rungs exist for.
         * Anything not PAID is still owed, and still worth a reminder.
         */
        status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
      },
      select: {
        installmentId: true,
        dueDate: true,
        reminderSentFlag: true,
        reminders: { select: { offsetDays: true } },
      },
    });

    let sent = 0;

    for (const installment of open) {
      const daysToDue = Math.round(
        (startOfDay(installment.dueDate).getTime() - today.getTime()) / 86_400_000,
      );
      const already = new Set(installment.reminders.map((r) => r.offsetDays));
      const current = currentRung(daysToDue);
      if (current === null || already.has(current)) continue;
      const owed = [current];

      // Resolved per installment, from its parent. A student on a college
      // contract's schedule is not a thing that can happen here.
      const recipient = await this.ledger.resolveRecipient(installment.installmentId);

      for (const offsetDays of owed) {
        const rung = RUNGS[offsetDays] ?? OVERDUE_RUNG;
        try {
          await this.prisma.$transaction(async (tx) => {
            await tx.feeInstallmentReminder.create({
              data: {
                installmentId: installment.installmentId,
                offsetDays,
                recipientType: recipient.recipientType === "STUDENT" ? "STUDENT" : "COLLEGE_USER",
                recipientId: recipient.recipientId,
                channel: "IN_PORTAL",
              },
            });

            /*
             * The first delivery channel these reminders have ever had.
             *
             * Until now the run LOGGED its dispatch and stopped — there is no
             * email or WhatsApp integration, so nothing actually reached
             * anybody. An in-portal notice does.
             *
             * Emitted only to a STUDENT. A college's reminder resolves to the
             * institution, which has no portal yet; the row above records that
             * it was owed, so nothing is lost when that portal arrives.
             */
            if (recipient.recipientType === "STUDENT") {
              await this.notifications.emit(tx, {
                type: offsetDays < 0 ? "installment.overdue" : "installment.due",
                class: rung.class,
                title: rung.title(recipient.dueDate),
                body: `${formatRupees(BigInt(recipient.outstandingMinor))} outstanding. Payments are made offline — contact the office to arrange it.`,
                ctaLabel: "See my fees",
                ctaHref: "/portal/fees",
                recipientType: "STUDENT",
                recipientId: recipient.recipientId,
                subjectType: "installment",
                subjectId: installment.installmentId,
              });
            }

            // Kept in step on the FIRST rung only, so anything already reading
            // the flag keeps working. It is no longer what decides anything.
            if (!installment.reminderSentFlag) {
              await tx.feeInstallment.update({
                where: { installmentId: installment.installmentId },
                data: { reminderSentFlag: true, reminderSentAt: new Date() },
              });
            }
          });
          sent += 1;
        } catch (error) {
          // The unique key firing means another run already climbed this rung.
          // That is the mechanism working, not a failure.
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          ) {
            continue;
          }
          throw error;
        }
      }
    }

    return sent;
  }

  /** Step 2 — past due and still unpaid. */
  private async markOverdue(now: Date): Promise<number> {
    const result = await this.prisma.feeInstallment.updateMany({
      where: {
        deletedAt: null,
        status: { in: ["PENDING", "PARTIALLY_PAID"] },
        dueDate: { lt: startOfDay(now) },
      },
      data: { status: "OVERDUE", overdueNoticeSentAt: new Date() },
    });
    return result.count;
  }

  /** Step 3 — a parent's status is derived, so it has to be recomputed. */
  private async rederiveParents(): Promise<number> {
    const [ledgers, contracts] = await Promise.all([
      this.prisma.studentFeeLedger.findMany({
        where: { deletedAt: null },
        select: { ledgerId: true },
      }),
      this.prisma.collegeContract.findMany({
        where: { deletedAt: null },
        select: { contractId: true },
      }),
    ]);

    await this.prisma.$transaction(async (tx) => {
      for (const { ledgerId } of ledgers) {
        await this.ledger.recomputeParent(tx, ledgerId, null);
      }
      for (const { contractId } of contracts) {
        await this.ledger.recomputeParent(tx, null, contractId);
      }
    });

    return ledgers.length + contracts.length;
  }
}

const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const endOfDay = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));

/**
 * The ladder, as offsets from the due date.
 *
 * Positive is before, 0 is the day itself, negative is overdue. Class escalates
 * with proximity because that is the only honest use of a badge: FYI while
 * there is time, ACTION_REQUIRED when there is not, ALERT once the date has
 * gone. A bill that shouts a week out teaches people to ignore it.
 */
const RUNGS: Record<number, { class: "FYI" | "ACTION_REQUIRED" | "ALERT"; title: (due: string) => string }> = {
  5: { class: "FYI", title: (due) => `An installment is due on ${due}` },
  3: { class: "FYI", title: (due) => `An installment is due on ${due}` },
  1: { class: "ACTION_REQUIRED", title: (due) => `An installment is due tomorrow, ${due}` },
  0: { class: "ACTION_REQUIRED", title: () => "An installment is due today" },
};

const OVERDUE_RUNG = {
  class: "ALERT" as const,
  title: (due: string) => `An installment was due on ${due} and is unpaid`,
};

/**
 * The one rung an installment is on, given how many days remain.
 *
 * Before the due date the rungs are fixed: 5, 3, 1 and 0. Past it they repeat
 * — 3 days, 7 days, then weekly — because "then weekly" has no last rung: an
 * installment nobody pays keeps being unpaid.
 *
 * Returns the LATEST rung reached, never the list of them. See the note on
 * `climbTheLadder` for what sending the whole list did to real data.
 */
function currentRung(daysToDue: number): number | null {
  if (daysToDue > 5) return null;
  if (daysToDue >= 0) {
    // The tightest rung at or below the days remaining.
    return [0, 1, 3, 5].find((rung) => daysToDue <= rung) ?? null;
  }

  const overdueBy = -daysToDue;
  if (overdueBy < 3) return null;
  if (overdueBy < 7) return -3;
  // Weekly from day 7, floored to the week so a run on any day of that week
  // climbs the same rung and the unique key does the rest.
  return -(7 + Math.floor((overdueBy - 7) / 7) * 7);
}
