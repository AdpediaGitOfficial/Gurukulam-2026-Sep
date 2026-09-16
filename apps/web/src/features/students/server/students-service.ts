import "server-only";

import {
  batchSchema,
  studentDetailSchema,
  studentSchema,
  unallocatedSummarySchema,
  type Batch,
  type Page,
  type Student,
  type StudentDetail,
  type UnallocatedSummary,
  assignmentSubmissionSchema,
  type AssignmentSubmission,
} from "@gurukulam/contracts";

import { BATCH_FILTERS } from "@/features/batches/server/batches-service";

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

/** One student's record, with where they are enrolled and what they owe. */
export async function getStudent(studentId: string): Promise<StudentDetail> {
  return studentDetailSchema.parse(await apiFetch(`/students/${studentId}`));
}

/**
 * The batches this student may actually join.
 *
 * Retail and college rosters never mix (invariant 2): a student may only join a
 * batch whose college matches their own — both null, or both equal. The API
 * refuses a mismatch, but offering one in the picker would be inviting an
 * operator to make a mistake the form could have prevented.
 */
export async function listJoinableBatches(student: StudentDetail): Promise<Page<Batch>> {
  const already = new Set(student.batches.map((b) => b.batchId));
  const page = await fetchPage(
    "/batches",
    batchSchema,
    student.collegeId === null
      ? { segment: "RETAIL", status: "SCHEDULED", pageSize: "100" }
      : { collegeId: student.collegeId, status: "SCHEDULED", pageSize: "100" },
    BATCH_FILTERS,
  );
  return { ...page, rows: page.rows.filter((batch) => !already.has(batch.batchId)) };
}

/**
 * What this student has handed in.
 *
 * Read-only: nothing in the API grades yet, so marks and feedback come back
 * null. Kept out of `getStudent` on purpose — a student with three years of
 * coursework should not make their profile slow to open.
 */
export const SUBMISSION_FILTERS = [...PAGE_KEYS, "studentId", "batchId", "status"] as const;

export async function listStudentSubmissions(
  studentId: string,
  params: SearchParams = {},
): Promise<Page<AssignmentSubmission>> {
  return fetchPage(
    "/batches/submissions",
    assignmentSubmissionSchema,
    { ...params, studentId, pageSize: params["pageSize"] ?? "50" },
    SUBMISSION_FILTERS,
  );
}
