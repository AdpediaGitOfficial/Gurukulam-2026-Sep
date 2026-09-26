import { z } from "zod";
import { batchSessionSchema } from "../batches/index.js";

/**
 * The trainer's own surface.
 *
 * ── Why this is small, and why the student's is not ────────────────────
 *
 * The student portal is `/me` end to end, because a student never writes a row
 * about anybody else and the admin responses carry fields they must never see.
 * A trainer is the opposite: most of what they write is about OTHER people —
 * attendance about named students, grades about one — and those must be the
 * same code path the admin console uses or the two will diverge on the rules
 * that matter.
 *
 * So the cohort reads go through the shared services with `trainerScope`
 * applied inside them, and this file covers only what is genuinely about the
 * trainer themselves: who they are, what is waiting for them, and the
 * invitations that are theirs to answer.
 */

export const trainerEngagementSchema = z.enum(["FREELANCE", "IN_HOUSE"]);
export type TrainerEngagement = z.infer<typeof trainerEngagementSchema>;

export const meTrainerSchema = z.object({
  trainerId: z.string(),
  trainerCode: z.string(),
  name: z.string(),
  /** Their real address. Distinct from the login, which is derived from the code. */
  email: z.string(),
  loginEmail: z.string().nullable(),
  phone: z.string().nullable(),
  /**
   * Decides whether Invitations exists at all.
   *
   * An in-house trainer is staff, not a counterparty: their assignment is
   * created CONFIRMED the moment they are allocated, so there is never
   * anything to accept. The entry is ABSENT for them rather than empty — the
   * trainer portal's version of the split that keeps Fees off a college
   * student's navigation.
   */
  engagement: trainerEngagementSchema,
  maxWeeklyHours: z.number().int().nullable(),
  approvedCourses: z.array(z.object({ courseId: z.string(), name: z.string() })),
  /**
   * Suspended, and why.
   *
   * Shown to them, because it is about them and because a portal that silently
   * refuses every write is a portal somebody reports as broken. Suspension
   * does NOT release their batches — pulling somebody off live delivery as a
   * side effect of a status change would strand the cohort — so they read
   * everything and write nothing.
   */
  suspended: z.boolean(),
  suspendedReason: z.string().nullable(),
});

export type MeTrainer = z.infer<typeof meTrainerSchema>;

/** A cohort of theirs, below its course's attendance floor. */
export const floorWarningSchema = z.object({
  batchId: z.string(),
  batchCode: z.string(),
  courseName: z.string().nullable(),
  floorPct: z.number().int(),
  studentsBelow: z.number().int(),
  rosterSize: z.number().int(),
});

export type FloorWarning = z.infer<typeof floorWarningSchema>;

/**
 * How delivery is going.
 *
 * Not a survey of an estate — a trainer has one. Every figure is something
 * they can act on, which is why "registers outstanding" and "waiting to be
 * marked" are here and "hours taught this year" is not.
 */
export const meTrainerDashboardSchema = z.object({
  nextSession: batchSessionSchema.nullable(),
  batchesRunning: z.number().int(),
  sessionsDelivered: z.number().int(),
  sessionsUpcoming: z.number().int(),
  /** Delivered sessions of theirs where no register was ever taken. */
  registersOutstanding: z.number().int(),
  /** Handed in, on their sessions, and not yet marked. */
  awaitingMarking: z.number().int(),
  /** Open invitations. Always 0 for an in-house trainer. */
  invitations: z.number().int(),
  belowFloor: z.array(floorWarningSchema),
});

export type MeTrainerDashboard = z.infer<typeof meTrainerDashboardSchema>;

/** A batch proposed to this trainer, waiting on their answer. */
export const meInvitationSchema = z.object({
  assignmentId: z.string(),
  batchId: z.string(),
  batchCode: z.string(),
  batchName: z.string(),
  courseName: z.string().nullable(),
  mode: z.string(),
  venue: z.string().nullable(),
  cityName: z.string().nullable(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  sessionCount: z.number().int(),
  rosterSize: z.number().int(),
  proposedAt: z.string(),
});

export type MeInvitation = z.infer<typeof meInvitationSchema>;
