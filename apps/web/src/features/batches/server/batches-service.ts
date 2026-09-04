import "server-only";

import {
  batchDetailSchema,
  batchSchema,
  batchSessionSchema,
  type Batch,
  type BatchDetail,
  type BatchSession,
  type Page,
} from "@gurukulam/contracts";

import { apiFetch } from "@/server/api";
import { fetchPage, PAGE_KEYS, type SearchParams } from "@/server/list";

export const BATCH_FILTERS = [
  ...PAGE_KEYS,
  "courseId",
  "collegeId",
  "cityId",
  "trainerId",
  "status",
  "segment",
] as const;

export async function listBatches(params: SearchParams): Promise<Page<Batch>> {
  return fetchPage("/batches", batchSchema, params, BATCH_FILTERS);
}

export const SESSION_FILTERS = [...PAGE_KEYS, "batchId", "trainerId", "status", "from", "to"] as const;

/**
 * Every session across every batch.
 *
 * Named `BatchSession` in the contract rather than `Session`, because an auth
 * session is a login — the two would collide in every import otherwise.
 */
export async function listSessions(params: SearchParams): Promise<Page<BatchSession>> {
  return fetchPage("/batches/sessions", batchSessionSchema, params, SESSION_FILTERS);
}

/** One batch with its roster counts and trainer assignments. */
export async function getBatch(batchId: string): Promise<BatchDetail> {
  return batchDetailSchema.parse(await apiFetch(`/batches/${batchId}`));
}
