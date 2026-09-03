import "server-only";

import { courseSchema, type Course, type Page } from "@gurukulam/contracts";

import { fetchPage, PAGE_KEYS, type SearchParams } from "@/server/list";

export const COURSE_FILTERS = [...PAGE_KEYS, "category", "isActive"] as const;

export async function listCourses(params: SearchParams): Promise<Page<Course>> {
  return fetchPage("/courses", courseSchema, params, COURSE_FILTERS);
}
