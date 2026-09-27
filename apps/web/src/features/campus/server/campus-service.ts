import "server-only";

import { z } from "zod";
import {
  batchSchema,
  campusCourseSchema,
  batchSessionSchema,
  certificateSchema,
  meCollegeBillingSchema,
  meCollegeDashboardSchema,
  meCollegeSchema,
  requirementSchema,
  studentSchema,
  submissionSchema,
  type Batch,
  type CampusCourse,
  type BatchSession,
  type Certificate,
  type MeCollege,
  type MeCollegeBilling,
  type MeCollegeDashboard,
  type Page,
  type Requirement,
  type Student,
  type Submission,
} from "@gurukulam/contracts";

import { apiFetch, checkShape } from "@/server/api";

/**
 * The college portal's seam.
 *
 * ── Why almost all of it reads the ORDINARY endpoints ───────────────────
 *
 * This is the portal the architecture always said would be built by NARROWING:
 * `collegeScope` has sat on the principal beside `cityScope` since the first
 * migration, every list service spreads it, and driving the real API as a real
 * college user confirmed the rows come back scoped — 1 college of 232, 51
 * students of 51 theirs, 110 batches of 232. A parallel `/me/college/students`
 * would be a second copy of a filter that already works, and the copy would be
 * the one that drifts.
 *
 * Only two things could NOT be narrowed, and both come from `/me/college`: the
 * home summary, because the operator dashboard reports figures that are not
 * derived from any scoped row, and billing, because in this segment the college
 * is the payer and that money is not in the per-student ledger at all
 * (invariant 3).
 *
 * ── What this file deliberately does NOT have ───────────────────────────
 *
 * Any call that issues, revokes, confirms, decides, releases, suspends,
 * deallocates or records an outcome. Those acts are ours, refused by
 * `assertOursToDecide` inside the API services. Omitting them here is not the
 * protection — the API is — but a portal that offers a button the server will
 * refuse is a portal that teaches people it is broken.
 */

export async function getCollege(): Promise<MeCollege> {
  const college = await apiFetch<MeCollege>("/me/college");
  checkShape(meCollegeSchema, college, "GET /me/college");
  return college;
}

export async function getDashboard(): Promise<MeCollegeDashboard> {
  const dashboard = await apiFetch<MeCollegeDashboard>("/me/college/dashboard");
  checkShape(meCollegeDashboardSchema, dashboard, "GET /me/college/dashboard");
  return dashboard;
}

export async function getBilling(): Promise<MeCollegeBilling> {
  const billing = await apiFetch<MeCollegeBilling>("/me/college/billing");
  checkShape(meCollegeBillingSchema, billing, "GET /me/college/billing");
  return billing;
}

/**
 * The catalogue they may pick from when raising a requirement.
 *
 * `/me/college/courses`, not `/courses`: the module is absent from their
 * permission matrix because the admin shape carries the standard price we quote
 * from, and in this segment the price is the negotiated contract. The narrow
 * shape has no field for it.
 */
export async function listCourses(): Promise<CampusCourse[]> {
  const courses = await apiFetch<CampusCourse[]>("/me/college/courses");
  checkShape(z.array(campusCourseSchema), courses, "GET /me/college/courses");
  return courses;
}

/** Their dedicated cohorts. Scoped by the API, never filtered here. */
export async function listBatches(): Promise<Batch[]> {
  const page = await apiFetch<Page<Batch>>("/batches?pageSize=100&sort=startDate&order=desc");
  checkShape(z.array(batchSchema), page.rows, "GET /batches");
  return page.rows;
}

/** The campus schedule — every session across their cohorts, flat. */
export async function listSessions(): Promise<BatchSession[]> {
  const page = await apiFetch<Page<BatchSession>>(
    "/batches/sessions?pageSize=200&sort=scheduledDate&order=asc",
  );
  checkShape(z.array(batchSessionSchema), page.rows, "GET /batches/sessions");
  return page.rows;
}

/** Their own intake. */
export async function listStudents(search?: string): Promise<Page<Student>> {
  const query = new URLSearchParams({ pageSize: "100", sort: "createdAt", order: "desc" });
  if (search !== undefined && search !== "") query.set("q", search);
  const page = await apiFetch<Page<Student>>(`/students?${query.toString()}`);
  checkShape(z.array(studentSchema), page.rows, "GET /students");
  return page;
}

/** What they have asked us for, and where each request has got to. */
export async function listRequirements(): Promise<Requirement[]> {
  const page = await apiFetch<Page<Requirement>>(
    "/colleges/requirements?pageSize=100&sort=createdAt&order=desc",
  );
  checkShape(z.array(requirementSchema), page.rows, "GET /colleges/requirements");
  return page.rows;
}

/**
 * Their students' certificates — the college half of invariant 7.
 *
 * The record, the number and the verification code belong to the student in
 * both segments; only the FILE is the college's. Which of those three states a
 * row is in is decided by `certificateAccess` on the API and asked per row, so
 * this list carries no access logic of its own.
 */
export async function listCertificates(): Promise<Certificate[]> {
  const page = await apiFetch<Page<Certificate>>(
    "/certificates?pageSize=200&sort=issuedAt&order=desc",
  );
  checkShape(z.array(certificateSchema), page.rows, "GET /certificates");
  return page.rows;
}

/** Lists of names they have put forward, and where each stands. */
export async function listSubmissions(): Promise<Submission[]> {
  const page = await apiFetch<Page<Submission>>(
    "/certificates/submissions?pageSize=100&sort=submittedAt&order=desc",
  );
  checkShape(z.array(submissionSchema), page.rows, "GET /certificates/submissions");
  return page.rows;
}
