import "server-only";

import { z } from "zod";
import {
  assignmentSchema,
  assignmentSubmissionSchema,
  batchDetailSchema,
  batchSchema,
  batchSessionSchema,
  sessionAttendanceSchema,
  sessionDetailSchema,
  trainerCandidateSchema,
  type Assignment,
  type AssignmentSubmission,
  type Batch,
  type BatchDetail,
  type BatchSession,
  type SessionAttendance,
  type SessionDetail,
  type TrainerCandidate,
  type Page,
  batchQuerySchema,
  sessionQuerySchema,
} from "@gurukulam/contracts";

import { apiFetch, checkShape } from "@/server/api";
import { fetchPage, PAGE_KEYS, type SearchParams } from "@/server/list";

export const BATCH_FILTERS = [
  ...PAGE_KEYS,
  "attention",
  "courseId",
  "collegeId",
  "cityId",
  "trainerId",
  "status",
  "segment",
] as const;

export async function listBatches(params: SearchParams): Promise<Page<Batch>> {
  return fetchPage("/batches", batchSchema, params, BATCH_FILTERS, batchQuerySchema);
}

export const SESSION_FILTERS = [
  ...PAGE_KEYS,
  "batchId",
  "trainerId",
  "status",
  "from",
  "to",
] as const;

/**
 * Every session across every batch.
 *
 * Named `BatchSession` in the contract rather than `Session`, because an auth
 * session is a login — the two would collide in every import otherwise.
 */
export async function listSessions(params: SearchParams): Promise<Page<BatchSession>> {
  return fetchPage(
    "/batches/sessions",
    batchSessionSchema,
    params,
    SESSION_FILTERS,
    sessionQuerySchema,
  );
}

/** One batch with its roster counts and trainer assignments. */
export async function getBatch(batchId: string): Promise<BatchDetail> {
  return batchDetailSchema.parse(await apiFetch(`/batches/${batchId}`));
}

/**
 * Who may be proposed for this batch, and who would be refused.
 *
 * Approved trainers only — proposing anyone else is refused outright — each
 * carrying the refusal the proposal would actually produce. The API computes
 * it with the same function the proposal uses, so the picker cannot drift out
 * of step with the endpoint it feeds.
 */
export async function listTrainerCandidates(batchId: string): Promise<TrainerCandidate[]> {
  return z
    .array(trainerCandidateSchema)
    .parse(await apiFetch(`/batches/${batchId}/trainer/candidates`));
}

/** One session, with its assignments and recording. */
export async function getSession(sessionId: string): Promise<SessionDetail> {
  return sessionDetailSchema.parse(await apiFetch(`/batches/sessions/${sessionId}`));
}

/**
 * One assignment, on its own.
 *
 * So the edit screen can be reloaded and bookmarked. It used to find the
 * assignment inside its session, named in a query string, which made the URL
 * work only when you arrived by clicking.
 */
export async function getAssignment(assignmentId: string): Promise<Assignment> {
  return assignmentSchema.parse(await apiFetch(`/batches/assignments/${assignmentId}`));
}

/**
 * Everything handed in against one assignment.
 *
 * ── Why the console needs this at all ──────────────────────────────────
 *
 * The console could set an assignment, edit it and delete it, and could not see
 * a single thing handed in against it. An operator could not answer "has anybody
 * submitted this yet" — and grading was reachable only from the trainer portal,
 * which contradicts the rule this product is built on: the console performs
 * every action the portals do, permanently, because a trainer released mid-cohort
 * otherwise leaves work nobody can mark.
 */
export async function listAssignmentSubmissions(
  assignmentId: string,
): Promise<AssignmentSubmission[]> {
  const page = await apiFetch<Page<AssignmentSubmission>>(
    `/batches/submissions?assignmentId=${encodeURIComponent(assignmentId)}&pageSize=200&sort=createdAt&order=asc`,
  );
  checkShape(z.array(assignmentSubmissionSchema), page.rows, "GET /batches/submissions");
  return page.rows;
}

/**
 * The register for one session.
 *
 * ── Why the console needs this too ─────────────────────────────────────
 *
 * `verify:coverage` found it: `POST /batches/sessions/:id/attendance` was called
 * from `/teach` and from nowhere else, so an operations team could not take or
 * correct a register at all. That is not a missing convenience — attendance is
 * what the certificate floor is judged on, so a class taught by a stand-in who
 * was never put on the batch, or a trainer who forgot, left a cohort with no
 * register and no way to give it one.
 *
 * The endpoint is the same one the trainer calls. `editable` comes back true for
 * an administrator on any session that has happened, because `trainerMayWrite`
 * only narrows a trainer.
 */
export async function getSessionAttendance(sessionId: string): Promise<SessionAttendance> {
  const attendance = await apiFetch<SessionAttendance>(
    `/batches/sessions/${encodeURIComponent(sessionId)}/attendance`,
  );
  checkShape(sessionAttendanceSchema, attendance, "GET attendance");
  return attendance;
}
