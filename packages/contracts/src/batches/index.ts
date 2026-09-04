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

export const batchQuerySchema = pageQuerySchema.extend({
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

export const trainerAssignmentSchema = z.object({
  assignmentId: z.string(),
  batchId: z.string(),
  trainerId: z.string(),
  trainerName: z.string().nullable().optional(),
  status: z.enum(["PROPOSED", "CONFIRMED", "DECLINED"]),
  proposedAt: z.string(),
  respondedAt: z.string().nullable(),
  declineReason: z.string().nullable(),
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

export const linkRecordingSchema = z.object({
  url: z.string().url("Enter the recording URL"),
  title: z.string().trim().max(200).optional(),
  provider: z.enum(["YOUTUBE", "S3", "ZOOM", "OTHER"]).default("YOUTUBE"),
  durationSeconds: z.number().int().min(0).optional(),
  isPublished: z.boolean().default(true),
});

export type LinkRecordingInput = z.infer<typeof linkRecordingSchema>;
