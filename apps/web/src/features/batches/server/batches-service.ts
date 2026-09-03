import "server-only";

import { batchSchema, type Batch, type Page } from "@gurukulam/contracts";

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
