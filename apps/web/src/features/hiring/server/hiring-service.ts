import "server-only";

import {
  jobPostingSchema,
  hiringSummarySchema,
  type JobPosting,
  type HiringSummary,
  type Page,
  jobQuerySchema,
} from "@gurukulam/contracts";

import { apiFetch } from "@/server/api";
import { fetchPage, PAGE_KEYS, type SearchParams } from "@/server/list";

export const JOB_FILTERS = [...PAGE_KEYS, "status", "courseId"] as const;

export async function listJobs(params: SearchParams): Promise<Page<JobPosting>> {
  return fetchPage("/hiring", jobPostingSchema, params, JOB_FILTERS, jobQuerySchema);
}

/** One posting, with its audience rules and the reach they currently give it. */
export async function getJob(jobPostingId: string): Promise<JobPosting> {
  return jobPostingSchema.parse(await apiFetch(`/hiring/${jobPostingId}`));
}

/** The board's headline figures. */
export async function getHiringSummary(): Promise<HiringSummary> {
  return hiringSummarySchema.parse(await apiFetch("/hiring/summary"));
}
