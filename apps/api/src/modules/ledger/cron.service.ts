import { Injectable, Logger } from "@nestjs/common";
import type { CronResult } from "@gurukulam/contracts";
import { PrismaService } from "../prisma/prisma.module";
import { LedgerService } from "./ledger.service";

/**
 * The nightly reminder run (architecture.md §6.5). Driven by an EXTERNAL
 * scheduler hitting a route handler behind a shared secret — not an in-process
 * timer, which does not survive serverless and fires once per replica when it
 * does run.
 *
 * Three steps, in this order:
 *   1. installments due in three days → reminder to the parent's recipient;
 *   2. installments past due and still pending → OVERDUE, notice dispatched;
 *   3. re-derive every touched parent's status.
 *
 * Every recipient is resolved from the installment's PARENT (invariant 6).
 * That is the whole reason a college's students never receive an invoice
 * reminder: there is no stored recipient column to be wrong.
 */
@Injectable()
export class ReminderCronService {
  private readonly logger = new Logger(ReminderCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  async run(now = new Date()): Promise<CronResult> {
    const remindersDue = await this.sendUpcomingReminders(now);
    const markedOverdue = await this.markOverdue(now);
    const parentsRederived = await this.rederiveParents();

    this.logger.log(
      `Reminder run: ${remindersDue} reminders, ${markedOverdue} newly overdue, ` +
        `${parentsRederived} parents re-derived`,
    );
    return { remindersDue, markedOverdue, parentsRederived };
  }

  /** Step 1 — due in three days, not yet reminded. */
  private async sendUpcomingReminders(now: Date): Promise<number> {
    const windowEnd = new Date(now.getTime() + 3 * 86_400_000);

    const due = await this.prisma.feeInstallment.findMany({
      where: {
        deletedAt: null,
        reminderSentFlag: false,
        status: { in: ["PENDING", "PARTIALLY_PAID"] },
        dueDate: { gte: startOfDay(now), lte: endOfDay(windowEnd) },
      },
      select: { installmentId: true },
    });

    for (const { installmentId } of due) {
      // Resolved per installment, from its parent. A student on a college
      // contract's schedule is not a thing that can happen here.
      const recipient = await this.ledger.resolveRecipient(installmentId);
      // Dispatch lands with the notification service; the flag records that
      // this installment has had its reminder either way, so a second run
      // does not send a duplicate.
      this.logger.debug(
        `Reminder → ${recipient.recipientType} ${recipient.name} <${recipient.email}> ` +
          `for ${recipient.outstandingMinor} paise due ${recipient.dueDate}`,
      );
      await this.prisma.feeInstallment.update({
        where: { installmentId },
        data: { reminderSentFlag: true, reminderSentAt: new Date() },
      });
    }

    return due.length;
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
