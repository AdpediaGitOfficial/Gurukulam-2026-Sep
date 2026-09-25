import { z } from "zod";
import { deliveryModeSchema, sessionStatusSchema } from "../batches/index.js";
import { moneyMinor } from "../common/money.js";

/**
 * What a student may see of themselves.
 *
 * ── Why these are not the admin contracts with fields removed ───────────
 *
 * The admin `Student` carries `notes`, `suspendedReason`, `createdBy`,
 * `createdByCollegeId` and the internal columns of a ledger. Under a shared
 * mapper those fields survive into the function and are taken out again by a
 * per-actor projection — and a per-actor projection inside a shared mapper is
 * precisely how a field escapes. It is one `if` away from being wrong, and
 * nothing fails when it is.
 *
 * These are separate shapes read by a separate service, so a field a student
 * must not see never enters the function at all. The price is some query logic
 * expressed twice; the rules — which batch is mine, which recording is
 * published — still live in one place each.
 */

// ── Profile ───────────────────────────────────────────────────────────────

export const meProfileSchema = z.object({
  studentId: z.string(),
  studentCode: z.string(),
  firstName: z.string(),
  lastName: z.string().nullable(),
  /** The address we write to. Distinct from the identity they sign in with. */
  email: z.string(),
  /** The derived portal identity, e.g. `stu-2026-0891@gurukulam.com`. */
  loginEmail: z.string().nullable(),
  phone: z.string().nullable(),
  altPhone: z.string().nullable(),
  addressLine1: z.string().nullable(),
  addressLine2: z.string().nullable(),
  postalCode: z.string().nullable(),
  cityName: z.string().nullable(),
  discipline: z.string().nullable(),
  passoutYear: z.number().int().nullable(),
  photoUrl: z.string().nullable(),
  /**
   * RETAIL or COLLEGE. Carried because the portal's shape depends on it —
   * invariant 3 makes Fees ABSENT for a college student rather than empty,
   * and invariant 7 makes their certificate a record rather than a download.
   * The college's NAME is carried; nothing about the contract behind it is.
   */
  segment: z.enum(["RETAIL", "COLLEGE"]),
  collegeName: z.string().nullable(),
  enrolledOn: z.string(),
});

export type MeProfile = z.infer<typeof meProfileSchema>;

/**
 * The narrow set a student may change.
 *
 * Everything absent from here is absent for a reason the portal shows as a
 * locked field rather than hiding:
 *
 *   · **Name** is printed on the certificate. Editable after issue, it would
 *     let a student change what the certificate attests.
 *   · **Email** resolves a fee reminder's recipient (invariant 6). Editable,
 *     it would let a student redirect their own invoices.
 *   · **Student code, college, segment, account status** are identity. Each
 *     re-answers a question the rest of the system has already answered.
 */
export const updateMeSchema = z.object({
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  altPhone: z.string().trim().max(20).optional().or(z.literal("")),
  addressLine1: z.string().trim().max(255).optional().or(z.literal("")),
  addressLine2: z.string().trim().max(255).optional().or(z.literal("")),
  postalCode: z.string().trim().max(12).optional().or(z.literal("")),
});

export type UpdateMeInput = z.infer<typeof updateMeSchema>;

// ── My learning ───────────────────────────────────────────────────────────

/**
 * One batch this student sits on.
 *
 * A finished enrolment still appears: the batch they completed is how they
 * explain the certificate they hold. `outcome` is the STUDENT's ending, not
 * the batch's — a batch can finish with somebody who left halfway still on its
 * roster, and those are different facts.
 */
export const meBatchSchema = z.object({
  batchId: z.string(),
  batchCode: z.string(),
  name: z.string(),
  courseName: z.string().nullable(),
  mode: deliveryModeSchema,
  startDate: z.string(),
  endDate: z.string().nullable(),
  /** The confirmed trainer. A proposal is not delivery and does not appear. */
  trainerName: z.string().nullable(),
  venue: z.string().nullable(),
  enrolledAt: z.string(),
  outcome: z.enum(["ACTIVE", "COMPLETED", "LEFT"]),
  completedAt: z.string().nullable(),
  sessionCount: z.number().int(),
  deliveredCount: z.number().int(),
});

export type MeBatch = z.infer<typeof meBatchSchema>;

/** A recording, only ever attached to a delivered session and only if published. */
export const meRecordingSchema = z.object({
  url: z.string(),
  title: z.string().nullable(),
  provider: z.string(),
});

export type MeRecording = z.infer<typeof meRecordingSchema>;

export const meSessionSchema = z.object({
  sessionId: z.string(),
  sessionCode: z.string(),
  title: z.string(),
  batchId: z.string(),
  batchCode: z.string(),
  courseName: z.string().nullable(),
  topicTitle: z.string().nullable(),
  trainerName: z.string().nullable(),
  scheduledDate: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  mode: deliveryModeSchema,
  venue: z.string().nullable(),
  /** Where to join. Absent for a session in a room. */
  meetingLink: z.string().nullable(),
  status: sessionStatusSchema,
  /**
   * Why it was called off, when it was. A cancelled session keeps its place in
   * the schedule: a student who planned around it is owed the explanation, and
   * a gap with no reason is what generates the phone call.
   */
  cancelReason: z.string().nullable(),
  /** Where it moved from, when it moved. Same reasoning as the cancellation. */
  rescheduledFrom: z.string().nullable(),
  recording: meRecordingSchema.nullable(),
});

export type MeSession = z.infer<typeof meSessionSchema>;

/**
 * The schedule, already split.
 *
 * A student's first question is "when is my next class", and it is answered
 * above the fold rather than found in a list — so the split is the server's
 * job, not a filter the screen applies to one long array.
 */
export const meScheduleSchema = z.object({
  upcoming: z.array(meSessionSchema),
  past: z.array(meSessionSchema),
});

export type MeSchedule = z.infer<typeof meScheduleSchema>;

/**
 * The landing page's three answers: when is my next session, what am I on,
 * and what have I finished. Computed server-side so the page is one fetch.
 */
export const meHomeSchema = z.object({
  firstName: z.string(),
  segment: z.enum(["RETAIL", "COLLEGE"]),
  nextSession: meSessionSchema.nullable(),
  activeBatches: z.number().int(),
  completedBatches: z.number().int(),
  /** Delivered sessions across every batch, and how many carry a recording. */
  deliveredSessions: z.number().int(),
  availableRecordings: z.number().int(),
});

export type MeHome = z.infer<typeof meHomeSchema>;

// ── My fees ───────────────────────────────────────────────────────────────

/**
 * Money, in the portal.
 *
 * ── Invariant 3, as a shape rather than a rule ──────────────────────────
 *
 * Billing follows segment: retail bills the student, college bills the
 * institution, and a college student has **no individual ledger**. That is not
 * "an empty ledger" — an empty Fees page reads as "you owe nothing yet", when
 * the truth is that it will never concern them.
 *
 * So the response says which world the reader is in before it says anything
 * about money. `ledgers` is empty for a college student *because there are
 * none*, and `billedToCollege` is what the screen renders instead of a total
 * of zero. A caller cannot accidentally show a college student a balance,
 * because there is no field carrying one.
 *
 * Every amount is a decimal string of paise. Nothing in the portal does
 * arithmetic on it — the API computes, the screen formats (invariant 5).
 */

export const meInstallmentStatusSchema = z.enum([
  "PENDING",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
]);

export type MeInstallmentStatus = z.infer<typeof meInstallmentStatusSchema>;

/**
 * One payment against one instalment.
 *
 * A reversal appears as its own entry rather than quietly removing the
 * original: the receipt keeps its number, and a student who was told money was
 * received is owed the record of it being taken back off.
 */
export const mePaymentSchema = z.object({
  transactionId: z.string(),
  transactionCode: z.string(),
  amountMinor: moneyMinor,
  paidAt: z.string(),
  paymentMode: z.string(),
  isReversal: z.boolean(),
  receiptNumber: z.string().nullable(),
});

export type MePayment = z.infer<typeof mePaymentSchema>;

export const meInstallmentSchema = z.object({
  installmentId: z.string(),
  installmentNumber: z.number().int(),
  amountMinor: moneyMinor,
  paidAmountMinor: moneyMinor,
  /** What is still owed on this one. Computed by the API, never by a screen. */
  outstandingMinor: moneyMinor,
  dueDate: z.string(),
  status: meInstallmentStatusSchema,
  /**
   * Past its due date with money still owed. Derived at READ time rather than
   * trusted from the stored status, which only moves when the nightly run
   * touches it — a student looking the morning after a missed date should not
   * be told it is still pending.
   */
  overdue: z.boolean(),
  payments: z.array(mePaymentSchema),
});

export type MeInstallment = z.infer<typeof meInstallmentSchema>;

/** One enrolment's money. A student on two courses has two of these. */
export const meLedgerSchema = z.object({
  ledgerId: z.string(),
  courseName: z.string().nullable(),
  batchCode: z.string().nullable(),
  /** What was actually agreed, after any negotiated discount. */
  enrolmentValueMinor: moneyMinor,
  paidMinor: moneyMinor,
  outstandingMinor: moneyMinor,
  installments: z.array(meInstallmentSchema),
});

export type MeLedger = z.infer<typeof meLedgerSchema>;

/** The next instalment with money still owed, across every enrolment. */
export const meNextDueSchema = z.object({
  installmentId: z.string(),
  courseName: z.string().nullable(),
  installmentNumber: z.number().int(),
  totalInstallments: z.number().int(),
  amountMinor: moneyMinor,
  outstandingMinor: moneyMinor,
  dueDate: z.string(),
  overdue: z.boolean(),
});

export type MeNextDue = z.infer<typeof meNextDueSchema>;

export const meFeesSchema = z.object({
  /** Read this before anything else on the object. See the note above. */
  billedToCollege: z.boolean(),
  collegeName: z.string().nullable(),
  ledgers: z.array(meLedgerSchema),
  /** Totals across every enrolment. All zero — and meaningless — for a college student. */
  totalPayableMinor: moneyMinor,
  totalPaidMinor: moneyMinor,
  totalOutstandingMinor: moneyMinor,
  nextDue: meNextDueSchema.nullable(),
  overdueCount: z.number().int(),
});

export type MeFees = z.infer<typeof meFeesSchema>;
