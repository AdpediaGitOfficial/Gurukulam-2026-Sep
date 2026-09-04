import { Injectable } from "@nestjs/common";
import { Prisma } from "@gurukulam/db";
import type {
  Installment, LedgerDetail, LedgerQuery, LedgerSummary, Page, Payment, Principal,
  RecordPaymentInput, ReminderRecipient, ReversePaymentInput, SetScheduleInput,
} from "@gurukulam/contracts";
import { PrismaService } from "../prisma/prisma.module";
import { IdService } from "../ids/id.service";
import { ApiException } from "../../common/errors";
import { assertInScope, cityScope, collegeScope, liveOnly } from "../../common/scope/scope";
import { listPage, orderBy, paginate } from "../../common/scope/pagination";
import { withBusinessIdRetry } from "../../common/business-id-retry";
import { parseMoneyField } from "../students/students.service";

const SORTABLE = ["createdAt", "balancePendingMinor", "status"] as const;

/**
 * The fee ledger — retail's billing parent — and the payment engine both
 * parents share.
 *
 * There is no delete on anything here. A receipt is a financial record; the
 * correction is a reversing entry, which is why `reversePayment` exists and
 * `remove` does not.
 */
@Injectable()
export class LedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdService,
  ) {}

  async list(principal: Principal, query: LedgerQuery): Promise<Page<LedgerSummary>> {
    const where: Prisma.StudentFeeLedgerWhereInput = {
      ...liveOnly(query.includeDeleted),
      // A ledger carries no city of its own; scope reads through the student.
      student: { ...cityScope(principal), ...collegeScope(principal), deletedAt: null },
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.courseId ? { courseId: query.courseId } : {}),
      ...(query.batchId ? { batchId: query.batchId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.overdueOnly
        ? { installments: { some: { deletedAt: null, status: "OVERDUE" } } }
        : {}),
      ...(query.q
        ? {
            OR: [
              { student: { firstName: { contains: query.q, mode: "insensitive" } } },
              { student: { lastName: { contains: query.q, mode: "insensitive" } } },
              { student: { studentCode: { contains: query.q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    return listPage(query, async () => {
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.studentFeeLedger.findMany({
          where,
          orderBy: orderBy(query, SORTABLE, "createdAt"),
          ...paginate(query),
          include: LEDGER_INCLUDE,
        }),
        this.prisma.studentFeeLedger.count({ where }),
      ]);
      return [rows.map(toLedgerSummary), total];
    });
  }

  /** The schedule lives here rather than in the register — counts reach 100. */
  async get(principal: Principal, ledgerId: string): Promise<LedgerDetail> {
    const ledger = await this.prisma.studentFeeLedger.findFirst({
      where: { ledgerId, deletedAt: null },
      include: {
        ...LEDGER_INCLUDE,
        installments: {
          where: { deletedAt: null },
          orderBy: { installmentNumber: "asc" },
          include: {
            transactions: { where: { deletedAt: null }, orderBy: { paidAt: "asc" } },
          },
        },
      },
    });
    if (!ledger) throw ApiException.notFound("Ledger");
    assertInScope(principal, ledger.student);

    return {
      ...toLedgerSummary(ledger),
      installments: ledger.installments.map((i) => ({
        ...toInstallment(i),
        payments: i.transactions.map(toPayment),
      })),
    };
  }

  /**
   * Records a payment.
   *
   * ONE transaction: the receipt, the installment, the parent's recomputed
   * totals, and the parent's re-derived status. Splitting these would let a
   * receipt exist against a balance that never moved.
   *
   * Overpayment is refused at write time, not corrected afterwards
   * (invariant 13). The database CHECK is the backstop; this is the message a
   * form can render.
   */
  async recordPayment(principal: Principal, input: RecordPaymentInput): Promise<Payment> {
    const installment = await this.prisma.feeInstallment.findFirst({
      where: { installmentId: input.installmentId, deletedAt: null },
      include: {
        ledger: { include: { student: true } },
        contract: { include: { college: true } },
      },
    });
    if (!installment) throw ApiException.notFound("Installment");
    this.assertInstallmentInScope(principal, installment);

    const amountMinor = parseMoneyField(input.amount, "amount");
    if (amountMinor <= 0n) {
      throw ApiException.validation({ amount: "Enter an amount greater than zero" });
    }

    // A cancelled contract does not collect. Accepting money against one
    // leaves a receipt nothing will ever reconcile.
    if (installment.contract?.status === "CANCELLED") {
      throw ApiException.conflict("That contract is cancelled and cannot take payments.");
    }

    const outstanding = installment.amountMinor - installment.paidAmountMinor;
    if (outstanding <= 0n) {
      throw ApiException.conflict("That installment is already settled.");
    }
    if (amountMinor > outstanding) {
      // Refused, never accepted-and-corrected: a corrected overpayment leaves
      // a reversal in the register that never had to exist.
      throw ApiException.validation({
        amount:
          `That is more than the ₹${(outstanding / 100n).toString()} still due on this ` +
          "installment. Record the exact amount, or split it across installments.",
      });
    }

    const paidAt = parseTimestamp(input.paidAt, "paidAt");
    const transactionCode = await this.ids.transactionCode();

    return withBusinessIdRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const payment = await tx.paymentTransaction.create({
          data: {
            transactionCode,
            installmentId: installment.installmentId,
            amountMinor,
            paymentMode: input.mode,
            externalTransactionId: input.transactionId || null,
            paidAt,
            bankOrHandle: input.bankOrHandle || null,
            receiptNumber: input.receiptNumber || null,
            notes: input.notes || null,
            recordedBy: principal.id,
            createdBy: principal.id,
          },
        });

        const paidAmountMinor = installment.paidAmountMinor + amountMinor;
        await tx.feeInstallment.update({
          where: { installmentId: installment.installmentId },
          data: {
            paidAmountMinor,
            status: paidAmountMinor >= installment.amountMinor ? "PAID" : "PARTIALLY_PAID",
            paidAt: paidAmountMinor >= installment.amountMinor ? paidAt : null,
          },
        });

        await this.recomputeParent(tx, installment.ledgerId, installment.contractId);
        return toPayment(payment);
      }),
    );
  }

  /**
   * Reverses a receipt. The original stays — that is the whole point of a
   * reversing entry — and a contra row records the correction.
   */
  async reversePayment(
    principal: Principal,
    transactionId: string,
    input: ReversePaymentInput,
  ): Promise<Payment> {
    const original = await this.prisma.paymentTransaction.findFirst({
      where: { transactionId, deletedAt: null },
      include: {
        installment: {
          include: {
            ledger: { include: { student: true } },
            contract: { include: { college: true } },
          },
        },
      },
    });
    if (!original) throw ApiException.notFound("Payment");
    if (original.isReversal) throw ApiException.conflict("A reversal cannot itself be reversed.");
    this.assertInstallmentInScope(principal, original.installment);

    const alreadyReversed = await this.prisma.paymentTransaction.findFirst({
      where: { reversesTransactionId: transactionId, deletedAt: null },
    });
    if (alreadyReversed) throw ApiException.conflict("That receipt has already been reversed.");

    const transactionCode = await this.ids.transactionCode();

    return withBusinessIdRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const reversal = await tx.paymentTransaction.create({
          data: {
            transactionCode,
            installmentId: original.installmentId,
            // Stored positive with the reversal flag rather than as a negative
            // amount: the CHECK forbids negatives, and a flag survives a
            // report that sums the column without reading the flag less
            // dangerously than a hidden sign would.
            amountMinor: original.amountMinor,
            paymentMode: original.paymentMode,
            externalTransactionId: original.externalTransactionId,
            paidAt: new Date(),
            isReversal: true,
            reversesTransactionId: original.transactionId,
            reversalReason: input.reason,
            recordedBy: principal.id,
            createdBy: principal.id,
          },
        });

        const installment = original.installment;
        const paidAmountMinor = installment.paidAmountMinor - original.amountMinor;
        await tx.feeInstallment.update({
          where: { installmentId: installment.installmentId },
          data: {
            paidAmountMinor: paidAmountMinor < 0n ? 0n : paidAmountMinor,
            status:
              paidAmountMinor <= 0n
                ? installment.dueDate < new Date()
                  ? "OVERDUE"
                  : "PENDING"
                : "PARTIALLY_PAID",
            paidAt: null,
          },
        });

        await this.recomputeParent(tx, installment.ledgerId, installment.contractId);
        return toPayment(reversal);
      }),
    );
  }

  /** Replaces a schedule. Refused once anything has been collected against it. */
  async setLedgerSchedule(principal: Principal, ledgerId: string, input: SetScheduleInput) {
    const ledger = await this.prisma.studentFeeLedger.findFirst({
      where: { ledgerId, deletedAt: null },
      include: { student: true },
    });
    if (!ledger) throw ApiException.notFound("Ledger");
    assertInScope(principal, ledger.student);

    return this.replaceSchedule(principal, input, {
      ledgerId,
      contractId: null,
      totalMinor: ledger.enrolmentValueMinor,
      label: "the agreed price",
    });
  }

  /**
   * Who a reminder for this installment reaches.
   *
   * Resolved from the PARENT, never from a stored column (invariant 6). A
   * stored recipient would be written once at creation and then be wrong the
   * first time a student transfers or a contract changes hands — and the
   * specific failure it prevents is a college's student receiving an invoice
   * that is not theirs.
   */
  async resolveRecipient(installmentId: string): Promise<ReminderRecipient> {
    const installment = await this.prisma.feeInstallment.findFirst({
      where: { installmentId, deletedAt: null },
      include: {
        ledger: { include: { student: true } },
        contract: { include: { college: { include: { pocs: { where: { isPrimary: true, deletedAt: null }, take: 1 } } } } },
      },
    });
    if (!installment) throw ApiException.notFound("Installment");

    const outstanding = installment.amountMinor - installment.paidAmountMinor;

    if (installment.ledger) {
      const student = installment.ledger.student;
      return {
        installmentId,
        recipientType: "STUDENT",
        recipientId: student.studentId,
        name: [student.firstName, student.lastName].filter(Boolean).join(" "),
        email: student.email,
        amountMinor: installment.amountMinor.toString(),
        outstandingMinor: outstanding.toString(),
        dueDate: installment.dueDate.toISOString().slice(0, 10),
      };
    }

    if (installment.contract) {
      const college = installment.contract.college;
      const poc = college.pocs[0];
      return {
        installmentId,
        recipientType: "COLLEGE",
        recipientId: college.collegeId,
        name: college.name,
        // The institution's contact, never a student of theirs.
        email: poc?.email ?? "",
        amountMinor: installment.amountMinor.toString(),
        outstandingMinor: outstanding.toString(),
        dueDate: installment.dueDate.toISOString().slice(0, 10),
      };
    }

    // Unreachable while the CHECK constraint holds, and worth saying so.
    throw ApiException.invariant(
      "That installment has no parent, which the schema forbids. Investigate the row.",
    );
  }

  // ── Shared internals ────────────────────────────────────────────────────

  /**
   * Replaces a schedule for either parent. One engine, so a contract's
   * schedule and a student's obey the same rule: the rows must total the
   * parent's value exactly.
   */
  async replaceSchedule(
    principal: Principal,
    input: SetScheduleInput,
    parent: { ledgerId: string | null; contractId: string | null; totalMinor: bigint; label: string },
  ): Promise<Installment[]> {
    const where: Prisma.FeeInstallmentWhereInput = parent.ledgerId
      ? { ledgerId: parent.ledgerId, deletedAt: null }
      : { contractId: parent.contractId, deletedAt: null };

    const collected = await this.prisma.paymentTransaction.count({
      where: { deletedAt: null, isReversal: false, installment: where },
    });
    if (collected > 0) {
      throw ApiException.conflict(
        "Money has already been collected against this schedule. Add or adjust individual " +
          "installments rather than replacing the whole plan.",
      );
    }

    const rows = input.installments.map((row, i) => ({
      amountMinor: parseMoneyField(row.amount, `installments.${i}.amount`),
      dueDate: parseTimestamp(row.dueDate, `installments.${i}.dueDate`),
    }));
    if (rows.some((r) => r.amountMinor <= 0n)) {
      throw ApiException.validation({ installments: "Every installment must be more than zero" });
    }

    const scheduled = rows.reduce((sum, r) => sum + r.amountMinor, 0n);
    if (scheduled !== parent.totalMinor) {
      throw ApiException.validation({
        installments:
          `The schedule totals ₹${(scheduled / 100n).toString()} but ${parent.label} is ` +
          `₹${(parent.totalMinor / 100n).toString()}. They must match.`,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.feeInstallment.updateMany({
        where,
        data: { deletedAt: new Date(), deletedBy: principal.id },
      });

      const created: Installment[] = [];
      for (const [index, row] of rows.entries()) {
        const installment = await tx.feeInstallment.create({
          data: {
            // Exactly one parent — the CHECK refuses anything else.
            ledgerId: parent.ledgerId,
            contractId: parent.contractId,
            installmentNumber: index + 1,
            amountMinor: row.amountMinor,
            dueDate: row.dueDate,
            createdBy: principal.id,
          },
        });
        created.push(toInstallment(installment));
      }

      await this.recomputeParent(tx, parent.ledgerId, parent.contractId);
      return created;
    });
  }

  /**
   * Recomputes a parent's totals and re-derives its status from its
   * installments. Status is derived, never set directly — a stored one drifts
   * the first time a payment lands.
   */
  async recomputeParent(
    tx: Prisma.TransactionClient,
    ledgerId: string | null,
    contractId: string | null,
  ): Promise<void> {
    const where: Prisma.FeeInstallmentWhereInput = ledgerId
      ? { ledgerId, deletedAt: null }
      : { contractId, deletedAt: null };

    const installments = await tx.feeInstallment.findMany({
      where,
      select: { amountMinor: true, paidAmountMinor: true, status: true },
    });

    const scheduled = installments.reduce((s, i) => s + i.amountMinor, 0n);
    const paid = installments.reduce((s, i) => s + i.paidAmountMinor, 0n);
    const anyOverdue = installments.some((i) => i.status === "OVERDUE");

    if (ledgerId) {
      const ledger = await tx.studentFeeLedger.findUniqueOrThrow({ where: { ledgerId } });
      // Balance is measured against the AGREED price, not the schedule, so a
      // schedule that has not been authored yet still shows what is owed.
      const balance = ledger.enrolmentValueMinor - paid;
      await tx.studentFeeLedger.update({
        where: { ledgerId },
        data: {
          totalPaidMinor: paid,
          balancePendingMinor: balance < 0n ? 0n : balance,
          status: anyOverdue
            ? "OVERDUE"
            : paid <= 0n
              ? "UNPAID"
              : paid >= ledger.enrolmentValueMinor
                ? "PAID_FULL"
                : "PARTIALLY_PAID",
        },
      });
      return;
    }

    if (contractId) {
      const contract = await tx.collegeContract.findUniqueOrThrow({ where: { contractId } });
      // total_value_minor is GENERATED; fall back to the schedule when no
      // basis has produced a total yet.
      const total = contract.totalValueMinor ?? scheduled;
      const balance = total - paid;
      await tx.collegeContract.update({
        where: { contractId },
        data: {
          totalPaidMinor: paid,
          balancePendingMinor: balance < 0n ? 0n : balance,
          // DRAFT → ACTIVE → PAID. Money arriving against a draft is the
          // strongest signal it is no longer one, and leaving it DRAFT would
          // show a paying contract as unsigned in the register. CANCELLED is
          // terminal and never revived by a recompute.
          status:
            contract.status === "CANCELLED"
              ? "CANCELLED"
              : paid >= total && total > 0n
                ? "PAID"
                : paid > 0n || contract.status === "ACTIVE"
                  ? "ACTIVE"
                  : contract.status,
        },
      });
    }
  }

  private assertInstallmentInScope(
    principal: Principal,
    installment: {
      ledger?: { student: { cityId: string | null; collegeId: string | null } } | null;
      contract?: { collegeId: string; college: { cityId: string } } | null;
    },
  ): void {
    if (installment.ledger) {
      assertInScope(principal, installment.ledger.student);
      return;
    }
    if (installment.contract) {
      assertInScope(principal, {
        cityId: installment.contract.college.cityId,
        collegeId: installment.contract.collegeId,
      });
    }
  }
}

const LEDGER_INCLUDE = {
  student: true,
  course: { select: { name: true } },
  batch: { select: { batchCode: true } },
  installments: {
    where: { deletedAt: null },
    select: { status: true, dueDate: true, amountMinor: true, paidAmountMinor: true },
  },
} satisfies Prisma.StudentFeeLedgerInclude;

type LedgerRow = Prisma.StudentFeeLedgerGetPayload<{ include: typeof LEDGER_INCLUDE }>;

function toLedgerSummary(row: LedgerRow): LedgerSummary {
  const paidCount = row.installments.filter((i) => i.status === "PAID").length;
  const overdue = row.installments.filter((i) => i.status === "OVERDUE");
  const upcoming = row.installments
    .filter((i) => i.status !== "PAID")
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0];

  return {
    ledgerId: row.ledgerId,
    studentId: row.studentId,
    studentCode: row.student.studentCode,
    studentName: [row.student.firstName, row.student.lastName].filter(Boolean).join(" "),
    courseId: row.courseId,
    courseName: row.course?.name ?? null,
    batchId: row.batchId,
    batchCode: row.batch?.batchCode ?? null,
    courseValueMinor: row.courseValueMinor.toString(),
    discountAmountMinor: row.discountAmountMinor?.toString() ?? null,
    enrolmentValueMinor: row.enrolmentValueMinor.toString(),
    totalPaidMinor: row.totalPaidMinor.toString(),
    balancePendingMinor: row.balancePendingMinor.toString(),
    status: row.status,
    installmentsPaid: paidCount,
    installmentsTotal: row.installments.length,
    nextDueDate: upcoming?.dueDate.toISOString().slice(0, 10) ?? null,
    overdueCount: overdue.length,
  };
}

export function toInstallment(row: {
  installmentId: string; ledgerId: string | null; contractId: string | null;
  installmentNumber: number; amountMinor: bigint; paidAmountMinor: bigint;
  dueDate: Date; status: string; paidAt: Date | null; reminderSentAt: Date | null;
}): Installment {
  return {
    installmentId: row.installmentId,
    ledgerId: row.ledgerId,
    contractId: row.contractId,
    installmentNumber: row.installmentNumber,
    amountMinor: row.amountMinor.toString(),
    paidAmountMinor: row.paidAmountMinor.toString(),
    // Derived on read — a stored outstanding is one more thing to keep true.
    outstandingMinor: (row.amountMinor - row.paidAmountMinor).toString(),
    dueDate: row.dueDate.toISOString().slice(0, 10),
    status: row.status as Installment["status"],
    paidAt: row.paidAt?.toISOString() ?? null,
    reminderSentAt: row.reminderSentAt?.toISOString() ?? null,
  };
}

export function toPayment(row: {
  transactionId: string; transactionCode: string; installmentId: string;
  amountMinor: bigint; paymentMode: string; externalTransactionId: string | null;
  paidAt: Date; bankOrHandle: string | null; receiptNumber: string | null;
  isReversal: boolean; reversesTransactionId: string | null; reversalReason: string | null;
  createdAt: Date;
}): Payment {
  return {
    transactionId: row.transactionId,
    transactionCode: row.transactionCode,
    installmentId: row.installmentId,
    amountMinor: row.amountMinor.toString(),
    paymentMode: row.paymentMode as Payment["paymentMode"],
    externalTransactionId: row.externalTransactionId,
    paidAt: row.paidAt.toISOString(),
    bankOrHandle: row.bankOrHandle,
    receiptNumber: row.receiptNumber,
    isReversal: row.isReversal,
    reversesTransactionId: row.reversesTransactionId,
    reversalReason: row.reversalReason,
    createdAt: row.createdAt.toISOString(),
  };
}

export function parseTimestamp(value: string, field: string): Date {
  const parsed = new Date(value.length <= 10 ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(parsed.getTime())) {
    throw ApiException.validation({ [field]: "Enter a date like 2026-10-05" });
  }
  return parsed;
}
