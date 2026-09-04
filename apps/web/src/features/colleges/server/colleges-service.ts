import "server-only";

import { z } from "zod";
import {
  batchSchema,
  collegeDetailSchema,
  collegeSchema,
  collegeUserSchema,
  studentSchema,
  type Batch,
  type College,
  type CollegeDetail,
  type CollegeUser,
  type Page,
  type Student,
} from "@gurukulam/contracts";

import { apiFetch } from "@/server/api";
import { fetchPage, PAGE_KEYS, type SearchParams } from "@/server/list";
import { BATCH_FILTERS } from "@/features/batches/server/batches-service";
import { STUDENT_FILTERS } from "@/features/students/server/students-service";

/** Filters this module accepts from the URL. Anything else is dropped. */
export const COLLEGE_FILTERS = [...PAGE_KEYS, "cityId", "discipline", "isActive"] as const;

/**
 * The only thing in this feature that knows where colleges come from.
 *
 * Scope is applied by the API, inside its own service (invariant 11). The
 * console never sends a scope filter — a client that could choose its own scope
 * would not be a scope.
 */
export async function listColleges(params: SearchParams): Promise<Page<College>> {
  return fetchPage("/colleges", collegeSchema, params, COLLEGE_FILTERS);
}

/** One college with its points of contact. Exactly one contact is primary. */
export async function getCollege(collegeId: string): Promise<CollegeDetail> {
  return collegeDetailSchema.parse(await apiFetch(`/colleges/${collegeId}`));
}

/**
 * The students this college has sent us.
 *
 * Filtered by college rather than by segment: a college's roster is defined by
 * the institution, not by the enrolment channel, and the two happen to coincide
 * only because a college student is by definition institutional intake.
 */
export async function listCollegeStudents(
  collegeId: string,
  params: SearchParams,
): Promise<Page<Student>> {
  return fetchPage("/students", studentSchema, { ...params, collegeId }, STUDENT_FILTERS);
}

/**
 * Batches dedicated to this college. A college batch never carries retail
 * students.
 *
 * Deliberately a short page: this is a summary on someone else's record, not
 * the batches module. The total still comes back, so the section can say how
 * many there are and link to the rest rather than rendering all of them.
 */
export async function listCollegeBatches(collegeId: string): Promise<Page<Batch>> {
  return fetchPage("/batches", batchSchema, { collegeId, pageSize: "10" }, BATCH_FILTERS);
}

/**
 * The college's portal accounts.
 *
 * A plain array, not a page: a college has a handful of these, and the endpoint
 * returns the lot.
 */
export async function listPortalAccess(collegeId: string): Promise<CollegeUser[]> {
  return z
    .array(collegeUserSchema)
    .parse(await apiFetch(`/colleges/${collegeId}/access`));
}
