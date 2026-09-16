import "server-only";

import {
  courseDetailSchema,
  courseSchema,
  type Course,
  type CourseDetail,
  type Page,
  courseQuerySchema,
} from "@gurukulam/contracts";

import { apiFetch } from "@/server/api";
import { fetchPage, PAGE_KEYS, type SearchParams } from "@/server/list";

export const COURSE_FILTERS = [...PAGE_KEYS, "category", "isActive", "delivery", "attention"] as const;

export async function listCourses(params: SearchParams): Promise<Page<Course>> {
  return fetchPage("/courses", courseSchema, params, COURSE_FILTERS, courseQuerySchema);
}

/** One course with its topics, in sequence. */
export async function getCourse(courseId: string): Promise<CourseDetail> {
  return courseDetailSchema.parse(await apiFetch(`/courses/${courseId}`));
}
