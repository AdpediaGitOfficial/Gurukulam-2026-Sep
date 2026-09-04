import { Injectable, Logger } from "@nestjs/common";
import type { AllocateStudentInput, AllocationResult, Principal } from "@gurukulam/contracts";
import { PrismaService } from "../prisma/prisma.module";
import { IdService } from "../ids/id.service";
import { ApiException } from "../../common/errors";
import { assertInScope } from "../../common/scope/scope";
import { withBusinessIdRetry } from "../../common/business-id-retry";
import { hashPassword } from "../auth/password";
import { studentLoginEmail } from "@gurukulam/contracts";
import { parseMoneyField } from "./students.service";
import { randomBytes } from "node:crypto";

/**
 * Allocation — the transaction the rest of the system is arranged around.
 *
 * Onboarding creates a record; allocation is where course, batch, price,
 * schedule and credentials are decided. It is ONE unit of work (invariant 12):
 * batch mapping, session access, ledger, installments and credentials, all of
 * it or none. A half-applied allocation is the worst state in the system — a
 * student on a roster with no ledger bills nobody, and one with a ledger and
 * no roster is charged for a course they cannot attend.
 *
 * Two rules split the work down the middle:
 *   · invariant 2 — a student may only join a batch whose college matches
 *     their own: both null, or both equal. Retail and college rosters never
 *     mix.
 *   · invariant 3 — billing follows segment. Retail bills the student, so a
 *     ledger is created. College bills the institution under its contract, so
 *     a college student gets NO individual ledger; an empty one would leave a
 *     permanently wrong balance figure in every report.
 */
@Injectable()
export class AllocationService {
  private readonly logger = new Logger(AllocationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdService,
  ) {}

  async allocate(
    principal: Principal,
    studentId: string,
    input: AllocateStudentInput,
  ): Promise<AllocationResult> {
    const student = await this.prisma.student.findFirst({
      where: { studentId, deletedAt: null },
    });
    if (!student) throw ApiException.notFound("Student");
    assertInScope(principal, student);

    const batch = await this.prisma.batch.findFirst({
      where: { batchId: input.batchId, deletedAt: null },
      include: { course: { select: { courseId: true, name: true, standardMarketValueMinor: true } } },
    });
    if (!batch) throw ApiException.validation({ batchId: "That batch no longer exists" });
    assertInScope(principal, batch);

    // ── Invariant 2 ───────────────────────────────────────────────────────
    // Both null, or both equal. Nothing else.
    if ((student.collegeId ?? null) !== (batch.collegeId ?? null)) {
      throw ApiException.invariant(
        student.collegeId === null
          ? "A retail student cannot join a college's dedicated batch."
          : "A college student can only join a batch dedicated to their own college.",
      );
    }

    if (batch.status === "COMPLETED" || batch.status === "CANCELLED") {
      throw ApiException.conflict(`This batch is ${batch.status.toLowerCase()}.`);
    }

    const already = await this.prisma.studentBatchMapping.findFirst({
      where: { studentId, batchId: input.batchId, deletedAt: null },
    });
    if (already) throw ApiException.conflict("This student is already on that batch's roster.");

    if (batch.maxCapacity !== null) {
      const enrolled = await this.prisma.studentBatchMapping.count({
        where: { batchId: input.batchId, deletedAt: null },
      });
      if (enrolled >= batch.maxCapacity) {
        throw ApiException.conflict(
          `This batch is full (${enrolled} of ${batch.maxCapacity}).`,
        );
      }
    }

    const isRetail = batch.collegeId === null;
    const pricing = isRetail
      ? this.validateRetailPricing(input, batch.course.standardMarketValueMinor)
      : this.refuseCollegePricing(input);

    // Sessions the student gains access to — past AND future. A student who
    // joins mid-course must still reach the recordings of what they missed.
    const sessions = await this.prisma.batchSession.findMany({
      where: { batchId: input.batchId, deletedAt: null },
      select: { sessionId: true },
    });

    // Allocated outside the transaction so a retry is not handed the same
    // number (see common/business-id-retry.ts).
    const transactionCode = pricing?.advance ? await this.ids.transactionCode() : null;

    const result = await withBusinessIdRetry(() =>
      this.prisma.$transaction(async (tx) => {
        // 1 — the roster. Session access follows from this row: a student on a
        //     live mapping reaches every session of that batch. There is no
        //     separate grant table to fall out of step with it.
        await tx.studentBatchMapping.create({
          data: {
            studentId,
            batchId: input.batchId,
            enrolledBy: principal.id,
            createdBy: principal.id,
          },
        });

        let ledgerId: string | null = null;
        let installmentCount = 0;

        // 2 — money, but ONLY for retail (invariant 3).
        if (isRetail && pricing) {
          const ledger = await tx.studentFeeLedger.create({
            data: {
              studentId,
              courseId: batch.courseId,
              batchId: input.batchId,
              courseValueMinor: batch.course.standardMarketValueMinor,
              enrolmentValueMinor: pricing.enrolmentValueMinor,
              advancePaidMinor: pricing.advanceMinor,
              totalPaidMinor: pricing.advanceMinor,
              balancePendingMinor: pricing.enrolmentValueMinor - pricing.advanceMinor,
              status: pricing.advanceMinor === 0n ? "UNPAID" : "PARTIALLY_PAID",
              createdBy: principal.id,
            },
          });
          ledgerId = ledger.ledgerId;

          // 3 — the hand-authored schedule. Exactly one parent is set; the
          //     CHECK constraint refuses anything else (invariant 4).
          let remainingAdvance = pricing.advanceMinor;
          for (const [index, row] of pricing.installments.entries()) {
            const applied = remainingAdvance >= row.amountMinor ? row.amountMinor : remainingAdvance;
            remainingAdvance -= applied;

            const installment = await tx.feeInstallment.create({
              data: {
                ledgerId: ledger.ledgerId,
                contractId: null,
                installmentNumber: index + 1,
                amountMinor: row.amountMinor,
                paidAmountMinor: applied,
                dueDate: row.dueDate,
                status:
                  applied === row.amountMinor ? "PAID" : applied > 0n ? "PARTIALLY_PAID" : "PENDING",
                paidAt: applied > 0n ? pricing.advance?.paidAt ?? new Date() : null,
                createdBy: principal.id,
              },
            });

            // 4 — the advance receipt, against the installments it settles.
            if (applied > 0n && pricing.advance && transactionCode) {
              await tx.paymentTransaction.create({
                data: {
                  transactionCode:
                    index === 0 ? transactionCode : `${transactionCode}-${index + 1}`,
                  installmentId: installment.installmentId,
                  amountMinor: applied,
                  paymentMode: pricing.advance.mode,
                  externalTransactionId: pricing.advance.transactionId ?? null,
                  paidAt: pricing.advance.paidAt,
                  bankOrHandle: pricing.advance.bankOrHandle ?? null,
                  notes: pricing.advance.notes ?? null,
                  recordedBy: principal.id,
                  createdBy: principal.id,
                },
              });
            }
          }
          installmentCount = pricing.installments.length;
        }

        // 5 — credentials. Issued for BOTH segments: a college student still
        //     needs the schedule, materials and recordings; what they do not
        //     get is certificate download (invariant 7).
        let credentialsIssued = false;
        if (input.issueCredentials && student.passwordHash === null) {
          await tx.student.update({
            where: { studentId },
            data: {
              // A temporary secret the student must replace. The welcome pack
              // carries it; nothing here logs it.
              passwordHash: hashPassword(randomBytes(18).toString("base64url")),
              // The portal identity, derived from the immutable student code
              // so it is unique by construction and never has to change. Their
              // own email is left alone — receipts go there.
              loginEmail: studentLoginEmail(student.studentCode),
              mustReset: true,
              credentialsIssuedAt: new Date(),
            },
          });
          credentialsIssued = true;
        }

        return { ledgerId, installmentCount, credentialsIssued };
      }),
    );

    this.logger.log(
      `Allocated ${student.studentCode} to ${batch.batchCode} ` +
        `(${isRetail ? "retail" : "college"}, ${result.installmentCount} installments)`,
    );

    return {
      studentId,
      studentCode: student.studentCode,
      batchId: batch.batchId,
      batchCode: batch.batchCode,
      segment: isRetail ? "RETAIL" : "COLLEGE",
      ledgerId: result.ledgerId,
      installmentCount: result.installmentCount,
      enrolmentValueMinor: pricing?.enrolmentValueMinor.toString() ?? null,
      balancePendingMinor: pricing
        ? (pricing.enrolmentValueMinor - pricing.advanceMinor).toString()
        : null,
      credentialsIssued: result.credentialsIssued,
      sessionsGranted: sessions.length,
    };
  }

  /** Removes a student from a roster without touching what they already paid. */
  async deallocate(principal: Principal, studentId: string, batchId: string, reason: string) {
    const student = await this.prisma.student.findFirst({ where: { studentId, deletedAt: null } });
    if (!student) throw ApiException.notFound("Student");
    assertInScope(principal, student);

    const mapping = await this.prisma.studentBatchMapping.findFirst({
      where: { studentId, batchId, deletedAt: null },
    });
    if (!mapping) throw ApiException.notFound("Roster entry");

    // The mapping is soft-deleted, not removed: that the student was once on
    // this roster is what makes an issued certificate explicable a year later.
    await this.prisma.studentBatchMapping.update({
      where: { mappingId: mapping.mappingId },
      data: { deletedAt: new Date(), deletedBy: principal.id, exitReason: reason, isActive: false },
    });
  }

  /**
   * Retail pricing. The schedule must account for the WHOLE enrolment value —
   * a schedule that sums to less leaves a balance nothing will ever collect,
   * and one that sums to more overcharges by construction.
   */
  private validateRetailPricing(input: AllocateStudentInput, standardValue: bigint) {
    if (!input.enrolmentValue) {
      throw ApiException.validation({
        enrolmentValue: "Enter the agreed price for this enrolment",
      });
    }
    const enrolmentValueMinor = parseMoneyField(input.enrolmentValue, "enrolmentValue");
    if (enrolmentValueMinor <= 0n) {
      throw ApiException.validation({ enrolmentValue: "The agreed price must be more than zero" });
    }
    if (enrolmentValueMinor > standardValue) {
      throw ApiException.validation({
        enrolmentValue: "The agreed price cannot exceed the course's standard market value",
      });
    }

    if (input.installments.length === 0) {
      throw ApiException.validation({
        installments: "Author at least one installment — otherwise nothing ever falls due",
      });
    }

    const installments = input.installments.map((row, i) => ({
      amountMinor: parseMoneyField(row.amount, `installments.${i}.amount`),
      dueDate: parseDueDate(row.dueDate, `installments.${i}.dueDate`),
    }));

    if (installments.some((r) => r.amountMinor <= 0n)) {
      throw ApiException.validation({ installments: "Every installment must be more than zero" });
    }

    const scheduled = installments.reduce((sum, r) => sum + r.amountMinor, 0n);
    if (scheduled !== enrolmentValueMinor) {
      throw ApiException.validation({
        installments:
          `The schedule totals ₹${(scheduled / 100n).toString()} but the agreed price is ` +
          `₹${(enrolmentValueMinor / 100n).toString()}. They must match.`,
      });
    }

    let advanceMinor = 0n;
    let advance: {
      mode: "UPI" | "CREDIT_CARD" | "DEBIT_CARD" | "CASH" | "OTHER";
      transactionId?: string;
      paidAt: Date;
      bankOrHandle?: string;
      notes?: string;
    } | null = null;

    if (input.advance) {
      advanceMinor = parseMoneyField(input.advance.amount, "advance.amount");
      if (advanceMinor > enrolmentValueMinor) {
        // Invariant 13's spirit: overpayment is refused at write time.
        throw ApiException.validation({
          "advance.amount": "The advance cannot exceed the agreed price",
        });
      }
      advance = {
        mode: input.advance.mode,
        transactionId: input.advance.transactionId,
        paidAt: parseDueDate(input.advance.paidAt, "advance.paidAt"),
        bankOrHandle: input.advance.bankOrHandle,
        notes: input.advance.notes,
      };
    }

    return { enrolmentValueMinor, advanceMinor, advance, installments };
  }

  /**
   * Refuses pricing on a college allocation rather than ignoring it. Silently
   * dropping it would let an operator believe a student was billed when the
   * institution's contract is what actually carries the money.
   */
  private refuseCollegePricing(input: AllocateStudentInput): null {
    if (input.enrolmentValue || input.advance || input.installments.length > 0) {
      throw ApiException.invariant(
        "A college student has no individual ledger — their institution is billed under its " +
          "contract. Remove the pricing and schedule from this allocation.",
      );
    }
    return null;
  }
}

function parseDueDate(value: string, field: string): Date {
  const parsed = new Date(value.length <= 10 ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(parsed.getTime())) {
    throw ApiException.validation({ [field]: "Enter a date like 2026-10-05" });
  }
  return parsed;
}
