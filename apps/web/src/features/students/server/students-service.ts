import "server-only";

import {
  studentSchema,
  unallocatedSummarySchema,
  type Page,
  type Student,
  type UnallocatedSummary,
} from "@gurukulam/contracts";

import { apiFetch } from "@/server/api";
import { fetchPage, PAGE_KEYS, type SearchParams } from "@/server/list";

export const STUDENT_FILTERS = [
  ...PAGE_KEYS,
  "collegeId",
  "cityId",
  "batchId",
  "courseId",
  "segment",
  "accountStatus",
  "allocated",
] as const;

export async function listStudents(params: SearchParams): Promise<Page<Student>> {
  return fetchPage("/students", studentSchema, params, STUDENT_FILTERS);
}

/**
 * The unallocated queue and its three sibling data-hygiene queues.
 *
 * A summary, not a list — `/students/unallocated` returns the ageing buckets
 * and the sibling counts. The rows themselves are the ordinary student list
 * with `allocated=false`, which is why the page fetches both.
 */
export async function getUnallocatedSummary(): Promise<UnallocatedSummary> {
  return unallocatedSummarySchema.parse(await apiFetch("/students/unallocated"));
}

/** The working queue itself: students with no live batch mapping. */
export async function listUnallocated(params: SearchParams): Promise<Page<Student>> {
  return fetchPage("/students", studentSchema, { ...params, allocated: "false" }, STUDENT_FILTERS);
}
