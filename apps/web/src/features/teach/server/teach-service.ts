import "server-only";

import { z } from "zod";
import {
  assignmentSubmissionSchema,
  availabilitySchema,
  batchSchema,
  batchSessionSchema,
  meInvitationSchema,
  meTrainerDashboardSchema,
  meTrainerSchema,
  sessionAttendanceSchema,
  type AssignmentSubmission,
  type Availability,
  type Batch,
  type BatchSession,
  type MeInvitation,
  type MeTrainer,
  type MeTrainerDashboard,
  type Page,
  type SessionAttendance,
} from "@gurukulam/contracts";

import { apiFetch, checkShape } from "@/server/api";

/**
 * The trainer portal's seam.
 *
 * ── Why most of it reads the ORDINARY endpoints ────────────────────────
 *
 * The student portal reads `/me/*` end to end, because a student never writes
 * a row about anybody else and the admin responses carry fields they must not
 * see. A trainer is the opposite: attendance is a row about named students and
 * a grade is a row about one, and those must be the same code path the console
 * uses or the two will diverge on the rules that matter.
 *
 * So `/batches` and `/batches/sessions` are the console's own endpoints, with
 * `trainerScope` applied INSIDE those services — a trainer asking for batches
 * gets the cohorts they teach and nothing else, decided in one place. Only the
 * things genuinely about the trainer come from `/me/trainer`.
 */

export async function getTrainer(): Promise<MeTrainer> {
  const trainer = await apiFetch<MeTrainer>("/me/trainer");
  checkShape(meTrainerSchema, trainer, "GET /me/trainer");
  return trainer;
}

export async function getDashboard(): Promise<MeTrainerDashboard> {
  const dashboard = await apiFetch<MeTrainerDashboard>("/me/trainer/dashboard");
  checkShape(meTrainerDashboardSchema, dashboard, "GET /me/trainer/dashboard");
  return dashboard;
}

export async function getInvitations(): Promise<MeInvitation[]> {
  const invitations = await apiFetch<MeInvitation[]>("/me/trainer/invitations");
  checkShape(z.array(meInvitationSchema), invitations, "GET /me/trainer/invitations");
  return invitations;
}

/** The cohorts they teach — scoped by the API, not filtered here. */
export async function listMyBatches(): Promise<Batch[]> {
  const page = await apiFetch<Page<Batch>>("/batches?pageSize=100&sort=startDate&order=desc");
  checkShape(z.array(batchSchema), page.rows, "GET /batches");
  return page.rows;
}

/** Every session across every batch of theirs, flat. */
export async function listMySessions(): Promise<BatchSession[]> {
  const page = await apiFetch<Page<BatchSession>>(
    "/batches/sessions?pageSize=200&sort=scheduledDate&order=asc",
  );
  checkShape(z.array(batchSessionSchema), page.rows, "GET /batches/sessions");
  return page.rows;
}

/**
 * The register for one session.
 *
 * `editable` arrives decided: a trainer released from the batch, or one
 * looking at a colleague's session, reads it and cannot write it, and the
 * screen renders that rather than working it out again.
 */
export async function getAttendance(sessionId: string): Promise<SessionAttendance> {
  const attendance = await apiFetch<SessionAttendance>(
    `/batches/sessions/${encodeURIComponent(sessionId)}/attendance`,
  );
  checkShape(sessionAttendanceSchema, attendance, "GET attendance");
  return attendance;
}

/**
 * The leave this trainer has declared.
 *
 * Read through the ordinary trainers endpoint with their own id, because the
 * availability service applies the identity check inside it — a trainer may
 * only read and write their own diary, and that rule lives in one place rather
 * than being re-stated by a second surface.
 */
/**
 * What has been handed in against this session's work.
 *
 * ── Why the SESSION and not the batch ──────────────────────────────────
 *
 * A trainer marks on the day's screen, beside the register — the two things a
 * session leaves behind. Fetched in one call rather than one per assignment,
 * because a session can carry several and a page whose cost grows with the
 * teaching is a page that gets slower the more somebody does.
 *
 * Scoped by the API on the trainer axis. That filter was MISSING until this
 * screen was built: city and college scope are both null for a trainer, so the
 * list returned every submission in the estate — another cohort's students, by
 * name, with their work. `trainerAssignmentScope` is what narrows it now.
 */
export async function listSessionSubmissions(sessionId: string): Promise<AssignmentSubmission[]> {
  const page = await apiFetch<Page<AssignmentSubmission>>(
    `/batches/submissions?sessionId=${encodeURIComponent(sessionId)}&pageSize=200&sort=createdAt&order=asc`,
  );
  checkShape(z.array(assignmentSubmissionSchema), page.rows, "GET /batches/submissions");
  return page.rows;
}

export async function listMyLeave(): Promise<Availability[]> {
  const trainer = await getTrainer();
  const leave = await apiFetch<Availability[]>(
    `/trainers/${encodeURIComponent(trainer.trainerId)}/availability`,
  );
  checkShape(z.array(availabilitySchema), leave, "GET availability");
  return leave;
}
