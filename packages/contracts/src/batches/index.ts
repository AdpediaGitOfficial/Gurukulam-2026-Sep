import { z } from "zod";
import { pageQuerySchema } from "../common/page.js";

/**
 * Delivery. `Course → Topic → Batch → Session → (Assignment · Recording)`.
 *
 * The session is the unit that actually happens on a given day, which is why
 * assignments and recordings hang off it rather than off the batch.
 */

export const batchStatusSchema = z.enum(["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);
export const sessionStatusSchema = z.enum(["SCHEDULED", "LIVE", "COMPLETED", "CANCELLED"]);
export const deliveryModeSchema = z.enum(["ONLINE", "OFFLINE", "HYBRID"]);
export const assignmentStatusSchema = z.enum(["DRAFT", "OPEN", "CLOSED"]);

export type BatchStatus = z.infer<typeof batchStatusSchema>;
export type SessionStatus = z.infer<typeof sessionStatusSchema>;
export type DeliveryMode = z.infer<typeof deliveryModeSchema>;

export const batchSchema = z.object({
  batchId: z.string(),
  batchCode: z.string(),
  name: z.string(),
  courseId: z.string(),
  courseName: z.string().nullable().optional(),
  /**
   * Set = dedicated to that college. Null = an open retail batch. The two
   * rosters never mix (invariant 2) — enforced where students are allocated.
   */
  collegeId: z.string().nullable(),
  collegeName: z.string().nullable().optional(),
  /** Derived, not stored: null collegeId means retail. */
  segment: z.enum(["RETAIL", "COLLEGE"]),
  cityId: z.string().nullable(),
  cityName: z.string().nullable().optional(),
  /** The CONFIRMED trainer only. A proposal does not appear here. */
  primaryTrainerId: z.string().nullable(),
  primaryTrainerName: z.string().nullable().optional(),
  mode: deliveryModeSchema,
  startDate: z.string(),
  endDate: z.string().nullable(),
  maxCapacity: z.number().int().nullable(),
  venue: z.string().nullable(),
  meetingLink: z.string().nullable(),
  /* Read back so the edit form can round-trip it — a write-only field is one
     an operator erases every time they correct something else. */
  notes: z.string().nullable(),
  status: batchStatusSchema,
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
  sessionCount: z.number().int().optional(),
  enrolledCount: z.number().int().optional(),
  completedSessionCount: z.number().int().optional(),
});

export type Batch = z.infer<typeof batchSchema>;

/**
 * The batch queues the dashboard counts, as a filter.
 *
 * One parameter with three values rather than three booleans: they are
 * mutually exclusive questions an operator asks one at a time, and a list that
 * accepted all three would have to decide what "stalled AND over capacity"
 * means when nobody asked it.
 *
 * These exist because a distribution segment that cannot be opened is trivia.
 * The dashboard counts them; this is how somebody sees WHICH rows.
 */
export const batchAttentionSchema = z.enum([
  /** Past its start date with not one session delivered. */
  "STALLED",
  /** Starting within a fortnight with no trainer confirmed. */
  "UNSTAFFED_SOON",
  /** More students mapped than the batch says it holds. */
  "OVER_CAPACITY",
]);

export type BatchAttention = z.infer<typeof batchAttentionSchema>;

export const batchQuerySchema = pageQuerySchema.extend({
  attention: batchAttentionSchema.optional(),
  courseId: z.string().optional(),
  collegeId: z.string().optional(),
  cityId: z.string().optional(),
  trainerId: z.string().optional(),
  status: batchStatusSchema.optional(),
  /** RETAIL means collegeId IS NULL; COLLEGE means it is set. */
  segment: z.enum(["RETAIL", "COLLEGE"]).optional(),
});

export type BatchQuery = z.infer<typeof batchQuerySchema>;

export const createBatchSchema = z.object({
  name: z.string().trim().min(1, "Give the batch a name").max(200),
  courseId: z.string().min(1, "Select a course"),
  /** Omit for a retail batch. Set it and the batch is dedicated. */
  collegeId: z.string().optional(),
  /** Required when the batch was created from a confirmed requirement. */
  requirementId: z.string().optional(),
  cityId: z.string().optional(),
  mode: deliveryModeSchema.default("OFFLINE"),
  startDate: z.string().min(1, "Choose a start date"),
  endDate: z.string().optional(),
  maxCapacity: z.number().int().min(1).max(1000).optional(),
  venue: z.string().trim().max(255).optional(),
  meetingLink: z.string().url("Enter a valid URL").optional().or(z.literal("")),
  notes: z.string().trim().max(4000).optional(),
});

export type CreateBatchInput = z.infer<typeof createBatchSchema>;

export const updateBatchSchema = createBatchSchema
  .omit({ courseId: true, collegeId: true, requirementId: true })
  .partial()
  .extend({ status: batchStatusSchema.optional() });

export type UpdateBatchInput = z.infer<typeof updateBatchSchema>;

/**
 * The trainer handshake (invariant 9). An admin proposes; the trainer confirms.
 * Only a confirmed assignment is committed delivery, and only then does the
 * batch gain a primary trainer.
 */
export const proposeTrainerSchema = z.object({
  trainerId: z.string().min(1, "Select a trainer"),
});

/**
 * Who may be proposed for this batch, and who would be refused.
 *
 * Only trainers approved for the batch's course appear — proposing anyone else
 * is refused outright (invariant 15), so offering them would be offering a
 * mistake.
 *
 * `blockedReason` is the refusal the proposal would actually produce, computed
 * by the same code path that produces it. A picker that guessed would either
 * warn about a proposal the API accepts or stay silent about one it refuses,
 * and both are worse than no warning at all.
 */
export const trainerCandidateSchema = z.object({
  trainerId: z.string(),
  trainerCode: z.string(),
  name: z.string(),
  cityName: z.string().nullable(),
  /**
   * Carried so the picker can say what choosing this person DOES: an in-house
   * trainer is confirmed as they are allocated, a freelancer is asked. Two
   * outcomes behind one control need saying before the click, not after.
   */
  engagement: z.enum(["IN_HOUSE", "FREELANCE"]),
  /** Their other sessions falling on this batch's session days. */
  committedSessions: z.number().int(),
  blockedReason: z.string().nullable(),
});

export type TrainerCandidate = z.infer<typeof trainerCandidateSchema>;
export type ProposeTrainerInput = z.infer<typeof proposeTrainerSchema>;

export const respondToProposalSchema = z
  .object({
    decision: z.enum(["CONFIRM", "DECLINE"]),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.decision !== "DECLINE" || (v.reason && v.reason.length > 0), {
    message: "Say why, so an admin can propose someone else knowingly",
    path: ["reason"],
  });
export type RespondToProposalInput = z.infer<typeof respondToProposalSchema>;

/**
 * Taking a trainer back off a batch.
 *
 * The reason is REQUIRED, for the same reason revoking a login and suspending
 * an account require one: releasing a CONFIRMED trainer un-staffs the batch and
 * clears its scheduled sessions, and an unexplained change of that size is the
 * thing whoever finds it has to go and ask about.
 */
export const releaseTrainerSchema = z.object({
  reason: z.string().trim().min(1, "Say why this trainer is being released").max(500),
});

export type ReleaseTrainerInput = z.infer<typeof releaseTrainerSchema>;

export const trainerAssignmentSchema = z.object({
  assignmentId: z.string(),
  batchId: z.string(),
  trainerId: z.string(),
  trainerName: z.string().nullable().optional(),
  status: z.enum(["PROPOSED", "CONFIRMED", "DECLINED"]),
  proposedAt: z.string(),
  respondedAt: z.string().nullable(),
  /**
   * True when this was confirmed at the moment it was made, because the
   * trainer is in-house.
   *
   * "They agreed" and "we assigned them" are different facts. `respondedAt` is
   * set either way, so without this the record cannot say afterwards which one
   * happened.
   */
  autoConfirmed: z.boolean(),
  declineReason: z.string().nullable(),
  /** Why an admin took the assignment back, as distinct from a decline. */
  releaseReason: z.string().nullable(),
  /**
   * When it was released, or null while it still stands.
   *
   * A released assignment is soft-deleted and still travels with the batch:
   * this list is a history, and the reason a batch has nobody on it today is
   * usually the assignment that ended.
   */
  releasedAt: z.string().nullable(),
});
export type TrainerAssignment = z.infer<typeof trainerAssignmentSchema>;

/**
 * What `GET /batches/:id` returns: the batch with its trainer proposals.
 *
 * A proposal is not a commitment — the assignment carries its own status until
 * the trainer confirms, which is why the history travels with the batch rather
 * than collapsing to a single trainer name.
 *
 * `completedSessionCount` is present on the list and absent here; it is
 * optional in the schema for exactly that reason.
 */
export const batchDetailSchema = batchSchema.extend({
  trainerAssignments: z.array(trainerAssignmentSchema),
});

export type BatchDetail = z.infer<typeof batchDetailSchema>;

// ── Sessions ──────────────────────────────────────────────────────────────

/** Named BatchSession rather than Session: an auth Session is a login. */
export const batchSessionSchema = z.object({
  sessionId: z.string(),
  sessionCode: z.string(),
  batchId: z.string(),
  batchCode: z.string().nullable().optional(),
  topicId: z.string().nullable(),
  topicTitle: z.string().nullable().optional(),
  trainerId: z.string().nullable(),
  trainerName: z.string().nullable().optional(),
  title: z.string(),
  sequence: z.number().int(),
  scheduledDate: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  mode: deliveryModeSchema,
  venue: z.string().nullable(),
  meetingLink: z.string().nullable(),
  status: sessionStatusSchema,
  completedAt: z.string().nullable(),
  rescheduledFrom: z.string().nullable(),
  rescheduleReason: z.string().nullable(),
  /* Why it was called off. Stored since the cancel endpoint existed and never
     carried to the console, so a cancelled session read as one nobody could
     explain — which is the thing that generates the phone calls. */
  cancelReason: z.string().nullable().optional(),
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
  assignmentCount: z.number().int().optional(),
  hasRecording: z.boolean().optional(),
});

export type BatchSession = z.infer<typeof batchSessionSchema>;

export const sessionQuerySchema = pageQuerySchema.extend({
  batchId: z.string().optional(),
  trainerId: z.string().optional(),
  status: sessionStatusSchema.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export type SessionQuery = z.infer<typeof sessionQuerySchema>;

/** "HH:MM" in 24-hour form. */
const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 09:30");

export const createSessionSchema = z
  .object({
    batchId: z.string().min(1, "Select a batch"),
    topicId: z.string().optional(),
    trainerId: z.string().optional(),
    title: z.string().trim().min(1, "Give the session a title").max(200),
    scheduledDate: z.string().min(1, "Choose a date"),
    startTime: timeString,
    endTime: timeString,
    mode: deliveryModeSchema.optional(),
    venue: z.string().trim().max(255).optional(),
    meetingLink: z.string().url("Enter a valid URL").optional().or(z.literal("")),
  })
  .refine((v) => v.endTime > v.startTime, {
    message: "The session must end after it starts",
    path: ["endTime"],
  });

export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export const updateSessionSchema = z.object({
  topicId: z.string().optional(),
  trainerId: z.string().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  mode: deliveryModeSchema.optional(),
  venue: z.string().trim().max(255).optional(),
  meetingLink: z.string().url().optional().or(z.literal("")),
});

export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;

/**
 * A reschedule updates in place so attendance and recordings stay attached —
 * identity is preserved, and the notification fan-out fires from the same
 * write.
 */
export const rescheduleSessionSchema = z
  .object({
    scheduledDate: z.string().min(1, "Choose the new date"),
    startTime: timeString,
    endTime: timeString,
    venue: z.string().trim().max(255).optional(),
    meetingLink: z.string().url().optional().or(z.literal("")),
    reason: z.string().trim().min(1, "Say why it moved — the roster is told").max(500),
  })
  .refine((v) => v.endTime > v.startTime, {
    message: "The session must end after it starts",
    path: ["endTime"],
  });

export type RescheduleSessionInput = z.infer<typeof rescheduleSessionSchema>;

// ── Assignments ───────────────────────────────────────────────────────────

export const assignmentSchema = z.object({
  assignmentId: z.string(),
  assignmentCode: z.string(),
  batchId: z.string(),
  sessionId: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  instructions: z.string().nullable(),
  attachmentUrl: z.string().nullable(),
  maxMarks: z.number().int().nullable(),
  dueAt: z.string().nullable(),
  status: assignmentStatusSchema,
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
  submissionCount: z.number().int().optional(),
});

export type Assignment = z.infer<typeof assignmentSchema>;

export const createAssignmentSchema = z.object({
  /** Optional by design (invariant 16) — an assignment belongs to a batch. */
  sessionId: z.string().optional(),
  title: z.string().trim().min(1, "Give the assignment a title").max(200),
  description: z.string().trim().max(4000).optional(),
  instructions: z.string().trim().max(8000).optional(),
  attachmentUrl: z.string().url("Enter a valid URL").optional().or(z.literal("")),
  maxMarks: z.number().int().min(1).max(1000).optional(),
  dueAt: z.string().optional(),
});

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;

export const updateAssignmentSchema = createAssignmentSchema
  .omit({ sessionId: true })
  .partial()
  .extend({ status: assignmentStatusSchema.optional() });

export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;

// ── Recordings ────────────────────────────────────────────────────────────

export const recordingSchema = z.object({
  recordingId: z.string(),
  sessionId: z.string(),
  title: z.string().nullable(),
  provider: z.string(),
  url: z.string(),
  durationSeconds: z.number().int().nullable(),
  isPublished: z.boolean(),
  publishedAt: z.string().nullable(),
});

export type Recording = z.infer<typeof recordingSchema>;

/**
 * What `GET /batches/sessions/:id` returns: the session with what hangs off it.
 *
 * Assignments and the recording travel with it because the session is the unit
 * that actually happened — an assignment is set against a delivered session,
 * and a recording is the artefact of one.
 */
export const sessionDetailSchema = batchSessionSchema.extend({
  assignments: z.array(assignmentSchema),
  recording: recordingSchema.nullable(),
});

export type SessionDetail = z.infer<typeof sessionDetailSchema>;

export const linkRecordingSchema = z.object({
  url: z.string().url("Enter the recording URL"),
  title: z.string().trim().max(200).optional(),
  provider: z.enum(["YOUTUBE", "S3", "ZOOM", "OTHER"]).default("YOUTUBE"),
  durationSeconds: z.number().int().min(0).optional(),
  isPublished: z.boolean().default(true),
});

export type LinkRecordingInput = z.infer<typeof linkRecordingSchema>;

// ── Assignment submissions ────────────────────────────────────────────────

/**
 * What a student handed in, and what it was marked.
 *
 * Read-only for now, deliberately. `marks_awarded`, `feedback`, `graded_by`
 * and `graded_at` are on the table and **nothing writes them yet** — grading
 * is the trainer portal's, and the plan has it built as an ordinary endpoint
 * for both actors rather than as a portal feature, because the admin console
 * cannot grade either. Until that lands these fields read null, which is the
 * honest answer rather than a zero.
 */
/* Named for the assignment, not bare `submissionStatus`: the certificates
   module has its own submission — a college sending a cohort up for
   certification — and two different things called the same thing in one
   namespace is a bug waiting for a tired afternoon. */
export const assignmentSubmissionStatusSchema = z.enum([
  "PENDING",
  "SUBMITTED",
  "GRADED",
  "LATE",
]);
export type AssignmentSubmissionStatus = z.infer<typeof assignmentSubmissionStatusSchema>;

export const assignmentSubmissionSchema = z.object({
  submissionId: z.string(),
  assignmentId: z.string(),
  assignmentCode: z.string().nullable(),
  assignmentTitle: z.string().nullable(),
  /** The assignment's ceiling, so a mark is legible without a second lookup. */
  maxMarks: z.number().int().nullable(),
  dueAt: z.string().nullable(),
  batchId: z.string().nullable(),
  batchCode: z.string().nullable(),
  sessionId: z.string().nullable(),
  sessionTitle: z.string().nullable(),

  studentId: z.string(),
  studentCode: z.string().nullable(),
  studentName: z.string().nullable(),

  status: assignmentSubmissionStatusSchema,
  submittedAt: z.string().nullable(),
  fileUrl: z.string().nullable(),
  /** Null until grading exists. Not zero — nobody has marked it. */
  marksAwarded: z.number().int().nullable(),
  feedback: z.string().nullable(),
  gradedAt: z.string().nullable(),
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
});

export type AssignmentSubmission = z.infer<typeof assignmentSubmissionSchema>;

export const assignmentSubmissionQuerySchema = pageQuerySchema.extend({
  studentId: z.string().optional(),
  assignmentId: z.string().optional(),
  batchId: z.string().optional(),
  status: assignmentSubmissionStatusSchema.optional(),
});

export type AssignmentSubmissionQuery = z.infer<typeof assignmentSubmissionQuerySchema>;

// ── Attendance ────────────────────────────────────────────────────────────

/**
 * The register for one session.
 *
 * ── Why the whole session is marked at once ─────────────────────────────
 *
 * A register is ONE act. Marking students one at a time leaves a half-taken
 * register that is indistinguishable from one where everybody else was absent
 * — and that distinction is load-bearing: `eligibility.service.ts` deliberately
 * reports NOT_EVALUATED rather than 0% when a batch has no rows, because a
 * certificate must not be refused on the strength of a register nobody took.
 *
 * So the write takes every student on the roster, and `takenAt` on the read
 * answers "has this been done" without counting rows.
 */
export const attendanceStatusSchema = z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]);
export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>;

export const attendanceRowSchema = z.object({
  studentId: z.string(),
  studentCode: z.string(),
  studentName: z.string(),
  /** Null until the register is taken. Not the same as ABSENT. */
  status: attendanceStatusSchema.nullable(),
  minutesPresent: z.number().int().nullable(),
  remarks: z.string().nullable(),
  markedAt: z.string().nullable(),
});

export type AttendanceRow = z.infer<typeof attendanceRowSchema>;

export const sessionAttendanceSchema = z.object({
  sessionId: z.string(),
  sessionCode: z.string(),
  sessionTitle: z.string(),
  batchId: z.string(),
  batchCode: z.string(),
  scheduledDate: z.string(),
  sessionStatus: z.enum(["SCHEDULED", "LIVE", "COMPLETED", "CANCELLED"]),
  /** When the register was last taken. Null means never. */
  takenAt: z.string().nullable(),
  /** Whether this reader may still write it — see `trainerMayWrite`. */
  editable: z.boolean(),
  rows: z.array(attendanceRowSchema),
  present: z.number().int(),
  absent: z.number().int(),
  late: z.number().int(),
  excused: z.number().int(),
});

export type SessionAttendance = z.infer<typeof sessionAttendanceSchema>;

export const markAttendanceSchema = z.object({
  entries: z
    .array(
      z.object({
        studentId: z.string().min(1),
        status: attendanceStatusSchema,
        minutesPresent: z.number().int().min(0).max(1440).optional(),
        remarks: z.string().trim().max(400).optional(),
      }),
    )
    .min(1, "Mark at least one student")
    .max(500),
});

export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;

/**
 * Marking a submission.
 *
 * ── Why `marksAwarded` is nullable in the input ─────────────────────────
 *
 * Feedback without a number is a real thing to want — "look at broadcasting
 * again" on a piece of work that was never scored out of anything. So an
 * assignment with no `maxMarks` can still be marked, and the refusal is the
 * other way round: a number against an assignment that has no ceiling is a
 * mark out of nothing, and a number above the ceiling is a typo.
 *
 * ── Why there is no "ungrade" ───────────────────────────────────────────
 *
 * Correcting a mark is re-grading it, which this does. Removing one entirely
 * would leave a student who was told 18/20 with a blank and no explanation —
 * and `graded_at` is what the portal reads to decide whether to show a mark at
 * all, so clearing it silently withdraws something a person already saw.
 */
export const gradeSubmissionSchema = z.object({
  marksAwarded: z.number().int().min(0).max(1000).nullable(),
  feedback: z.string().trim().max(4000).optional(),
});

export type GradeSubmissionInput = z.infer<typeof gradeSubmissionSchema>;
