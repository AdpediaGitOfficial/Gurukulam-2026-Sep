import "server-only";

import { jobPostingSchema, type JobPosting, type Page } from "@gurukulam/contracts";

import { fetchPage, PAGE_KEYS, type SearchParams } from "@/server/list";

export const JOB_FILTERS = [...PAGE_KEYS, "status", "courseId"] as const;

export async function listJobs(params: SearchParams): Promise<Page<JobPosting>> {
  return fetchPage("/hiring", jobPostingSchema, params, JOB_FILTERS);
}
