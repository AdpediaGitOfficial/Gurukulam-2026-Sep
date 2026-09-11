import "server-only";

import { jobPostingSchema, type JobPosting, type Page } from "@gurukulam/contracts";

import { apiFetch } from "@/server/api";
import { fetchPage, PAGE_KEYS, type SearchParams } from "@/server/list";

export const JOB_FILTERS = [...PAGE_KEYS, "status", "courseId"] as const;

export async function listJobs(params: SearchParams): Promise<Page<JobPosting>> {
  return fetchPage("/hiring", jobPostingSchema, params, JOB_FILTERS);
}

/** One posting, with its audience rules and the reach they currently give it. */
export async function getJob(jobPostingId: string): Promise<JobPosting> {
  return jobPostingSchema.parse(await apiFetch(`/hiring/${jobPostingId}`));
}
