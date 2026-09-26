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

// ── My assignments ────────────────────────────────────────────────────────

/**
 * Work set against a session, and what this student handed in.
 *
 * ── Why a closed assignment still appears ───────────────────────────────
 *
 * Closing stops submission; it does not hide the work. A student who missed
 * something needs to see what it was — to ask about it, to know why a mark is
 * missing, to catch up before the next one. A list that quietly shortened
 * would leave them unable to tell "I did everything" from "I never saw it".
 *
 * A DRAFT assignment is a different thing: nobody has decided it exists yet,
 * and showing one would set work the trainer has not set.
 */

export const meSubmissionStatusSchema = z.enum(["PENDING", "SUBMITTED", "GRADED", "LATE"]);
export type MeSubmissionStatus = z.infer<typeof meSubmissionStatusSchema>;

/** What this student handed in. Absent until they do. */
export const meSubmissionSchema = z.object({
  submissionId: z.string(),
  status: meSubmissionStatusSchema,
  submittedAt: z.string().nullable(),
  /** A link. There is no file storage, so nothing is uploaded — see `submitAssignmentSchema`. */
  fileUrl: z.string().nullable(),
  contentText: z.string().nullable(),
  /**
   * Marks and feedback are the TRAINER's to write, and the trainer portal is
   * not built. These read null today, which is the honest answer — a zero
   * would say the work was marked and found worthless.
   */
  marksAwarded: z.number().int().nullable(),
  feedback: z.string().nullable(),
  gradedAt: z.string().nullable(),
});

export type MeSubmission = z.infer<typeof meSubmissionSchema>;

export const meAssignmentSchema = z.object({
  assignmentId: z.string(),
  assignmentCode: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  instructions: z.string().nullable(),
  /** Reference material the trainer attached. Not somewhere to upload to. */
  attachmentUrl: z.string().nullable(),
  maxMarks: z.number().int().nullable(),
  dueAt: z.string().nullable(),
  batchCode: z.string(),
  courseName: z.string().nullable(),
  /** The delivered session this was set against, when there is one. */
  sessionTitle: z.string().nullable(),
  /** OPEN takes submissions; CLOSED is history you can still read. */
  open: z.boolean(),
  /**
   * Past its due date and nothing handed in. Computed at read time — there is
   * no nightly job moving assignments, so a stored flag would simply be wrong
   * the moment the date passed.
   */
  overdue: z.boolean(),
  submission: meSubmissionSchema.nullable(),
});

export type MeAssignment = z.infer<typeof meAssignmentSchema>;

/**
 * Handing work in.
 *
 * ── Why there is no file ────────────────────────────────────────────────
 *
 * S3 is not integrated. An upload control with nowhere to put the file is a
 * promise the product cannot keep, so a submission is a LINK plus a note —
 * which is what the columns model, and what a student can produce from any
 * drive they already use.
 *
 * At least one of the two is required. A submission carrying neither is a row
 * saying "handed in" with nothing in it, which is worse than not having
 * submitted: it stops the reminder and gives the trainer nothing to mark.
 */
export const submitAssignmentSchema = z
  .object({
    fileUrl: z.string().url("Paste a link that starts with https://").optional().or(z.literal("")),
    contentText: z.string().trim().max(5000).optional().or(z.literal("")),
  })
  .refine((v) => (v.fileUrl ?? "") !== "" || (v.contentText ?? "") !== "", {
    message: "Add a link to your work, or write your answer here",
    path: ["fileUrl"],
  });

export type SubmitAssignmentInput = z.infer<typeof submitAssignmentSchema>;

/**
 * The three states a student's assignment list actually has.
 *
 * Split server-side rather than filtered on the screen, because each part
 * needs a DIFFERENT sentence and the difference is not cosmetic: one is work
 * you can still do, one is work you are waiting to hear about, and one is work
 * the window closed on. A single list sorted by date says all three with the
 * same voice.
 *
 * `missed` is the one that would be easiest to leave out, and the one that
 * matters most: a student cannot ask about work they were never shown.
 */
export const meAssignmentsSchema = z.object({
  /** Open, and nothing handed in yet. The only part carrying a verb. */
  outstanding: z.array(meAssignmentSchema),
  /** Handed in — marked or waiting to be. */
  submitted: z.array(meAssignmentSchema),
  /** Closed with nothing handed in. Readable, and no longer actionable. */
  missed: z.array(meAssignmentSchema),
});

export type MeAssignments = z.infer<typeof meAssignmentsSchema>;

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
  /**
   * The soonest piece of work still to hand in, and how many there are.
   *
   * Carried in full rather than as a count, for the same reason `nextSession`
   * is: the home page's job is to answer "what do I do next", and a number
   * makes a student open another screen to find out what the next thing IS.
   */
  nextAssignment: meAssignmentSchema.nullable(),
  assignmentsDue: z.number().int(),
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

// ── My certificates ───────────────────────────────────────────────────────

/**
 * What a student has earned, and what they can do with it.
 *
 * ── Invariant 7, as two fields rather than a rule ───────────────────────
 *
 * Eligibility is identical across segments; ACCESS is not. A retail student
 * downloads their own certificate. A college student earned it on exactly the
 * same terms and does not — their institution collects and issues it.
 *
 * So the shape carries `downloadUrl` and `heldByCollege` separately, and they
 * are not opposites. Three states are real and each needs a different sentence:
 * a link to fetch, "your college holds it", and "there is no PDF yet". A single
 * boolean would collapse the last two, and a student told their college has
 * something the office has never been sent is a student sent to argue with a
 * stranger.
 *
 * The API decides this with `certificateAccess`, the same function the admin
 * download goes through. Nothing here restates the rule.
 *
 * ── Why DRAFT is absent and REVOKED is not ──────────────────────────────
 *
 * A DRAFT certificate has not been issued — it is an admin's work in progress,
 * and showing one promises something nobody has granted.
 *
 * A REVOKED one is shown, because the alternative is worse: a certificate that
 * silently vanished leaves a student handing out a code that now fails
 * verification with no idea why. The revocation's REASON is withheld — it is
 * written for the register, not for the person it is about, and a revocation is
 * precisely the case that wants a conversation rather than a line of text.
 */
export const meCertificateStatusSchema = z.enum(["ISSUED", "REVOKED"]);
export type MeCertificateStatus = z.infer<typeof meCertificateStatusSchema>;

export const meCertificateSchema = z.object({
  certificateId: z.string(),
  /** Printed on the certificate. GK-CERT-2026-00418. */
  certificateNumber: z.string(),
  /**
   * What an employer types into the public verifier — deliberately NOT the
   * number, which appears on the certificate itself and would let anyone
   * holding a photograph of one enumerate the register.
   */
  verificationCode: z.string(),
  courseName: z.string().nullable(),
  batchCode: z.string(),
  status: meCertificateStatusSchema,
  issuedDate: z.string().nullable(),
  revokedAt: z.string().nullable(),
  /** A link, only when a PDF exists AND it is theirs to fetch. See above. */
  downloadUrl: z.string().nullable(),
  /** Invariant 7: they earned it identically, and their institution holds it. */
  heldByCollege: z.boolean(),
});

export type MeCertificate = z.infer<typeof meCertificateSchema>;

/**
 * Where a student stands, and what they hold.
 *
 * `awaiting` is the batches with no certificate against them yet, carried as
 * whole batches rather than a bespoke shape — `MeBatch` already says how far a
 * batch has got, and a second nearly-identical type is a second thing to keep
 * true. It exists because "why have I not got mine" is the question this screen
 * is actually opened with, and a page listing only what a student already has
 * cannot answer it.
 */
export const meCertificatesSchema = z.object({
  /** Named so the held-by-college sentence can name the institution. */
  collegeName: z.string().nullable(),
  certificates: z.array(meCertificateSchema),
  awaiting: z.array(meBatchSchema),
});

export type MeCertificates = z.infer<typeof meCertificatesSchema>;

// ── Jobs for me ───────────────────────────────────────────────────────────

/**
 * A posting this student matches.
 *
 * ── Why `matchedOn` is part of the contract ─────────────────────────────
 *
 * A student sees a posting because they FIT ITS AUDIENCE, not because everyone
 * sees it. Left unsaid, a targeted feed is indistinguishable from a noticeboard
 * — and the difference matters twice over: it tells a student the listing is
 * worth their time, and it tells them why the next one did not appear.
 *
 * The reasons are built from the rules that actually matched, on the server,
 * because the rules are not in this contract and must not be: an audience rule
 * is the operator's targeting, and a student reading "college = Sri Narayana,
 * passout = 2027, segment = COLLEGE" is reading our filing system rather than
 * an explanation.
 *
 * ── There is no `applied` ───────────────────────────────────────────────
 *
 * There is no application table. v1 is: see the posting, follow its link.
 * Tracking applications is a schema addition and a decision — worth taking
 * alongside the external feed — and a button that records nothing would be
 * worse than its absence, because a student would believe they had applied.
 */
export const meJobSchema = z.object({
  jobPostingId: z.string(),
  jobCode: z.string(),
  roleTitle: z.string(),
  companyName: z.string(),
  location: z.string().nullable(),
  workMode: z.enum(["ONSITE", "REMOTE", "HYBRID"]),
  experienceMinYears: z.number().int().nullable(),
  experienceMaxYears: z.number().int().nullable(),
  /** Paise, like every other amount that crosses this wire (invariant 5). */
  compensationMinMinor: moneyMinor.nullable(),
  compensationMaxMinor: moneyMinor.nullable(),
  compensationPeriod: z.string().nullable(),
  skills: z.array(z.string()),
  description: z.string().nullable(),
  /**
   * One resolved link, not two columns.
   *
   * `apply_url` and `external_url` are our bookkeeping — the second exists for
   * the deferred Naukri feed. From the student's side there is one act, "open
   * the listing", and which column carried it is not their problem.
   */
  applyUrl: z.string().nullable(),
  applyEmail: z.string().nullable(),
  closingDate: z.string().nullable(),
  publishedAt: z.string().nullable(),
  /** In the student's own words: "Data Analytics, which you have finished". */
  matchedOn: z.array(z.string()),
});

export type MeJob = z.infer<typeof meJobSchema>;

// ── My notifications ──────────────────────────────────────────────────────

/**
 * What has changed, as a student reads it.
 *
 * ── Why this is not the admin's bell ────────────────────────────────────
 *
 * The console's bell is a WORK QUEUE whose design goal is to reach zero, and
 * its audience rule includes every row addressed to nobody in particular —
 * which is every operator situation in the system. A student must never be in
 * that audience, and the safest way to guarantee it is a surface where the
 * query is anchored to `principal.id` and has no "everyone" branch to fall
 * through, exactly as the rest of `/me` is.
 *
 * ── The three classes, and what each is for ─────────────────────────────
 *
 * `ACTION_REQUIRED` badges and is something to do. `ALERT` is something that
 * happened TO them — a cancelled class, a missed payment — and persists.
 * `FYI` never badges: a count that never clears teaches people to stop looking
 * at the count.
 */
export const meNoticeClassSchema = z.enum(["ACTION_REQUIRED", "ALERT", "FYI"]);
export type MeNoticeClass = z.infer<typeof meNoticeClassSchema>;

export const meNoticeSchema = z.object({
  notificationId: z.string(),
  /** A key from the catalogue, e.g. "session.cancelled". */
  type: z.string(),
  class: meNoticeClassSchema,
  title: z.string(),
  body: z.string().nullable(),
  /** Where to go about it. Always inside the portal — never an admin route. */
  ctaLabel: z.string().nullable(),
  ctaHref: z.string().nullable(),
  read: z.boolean(),
  createdAt: z.string(),
});

export type MeNotice = z.infer<typeof meNoticeSchema>;

/**
 * The feed, with the one number the nav renders.
 *
 * `badge` deliberately excludes FYI. Most of what a student is told is FYI —
 * a session moved, a recording went up — and a badge that is permanently lit
 * is a badge nobody reads.
 */
export const meNotificationsSchema = z.object({
  items: z.array(meNoticeSchema),
  badge: z.number().int(),
  unread: z.number().int(),
});

export type MeNotifications = z.infer<typeof meNotificationsSchema>;

/**
 * Marking things read.
 *
 * ACTION_REQUIRED is deliberately unaffected, the same way it is in the
 * console: those clear when their condition does — the work is handed in, the
 * instalment is paid — not when somebody looks at them. A student who could
 * dismiss "work due tomorrow" would have dismissed the only thing on the
 * screen that was asking them to act.
 */
export const markNoticesReadSchema = z
  .object({
    notificationIds: z.array(z.string()).max(200).optional(),
    all: z.boolean().default(false),
  })
  .refine((v) => v.all || (v.notificationIds?.length ?? 0) > 0, {
    message: "Name what to mark read, or mark everything",
    path: ["notificationIds"],
  });

export type MarkNoticesReadInput = z.infer<typeof markNoticesReadSchema>;
