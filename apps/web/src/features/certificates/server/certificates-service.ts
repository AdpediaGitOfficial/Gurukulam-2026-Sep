import "server-only";
import {
  certificateSchema,
  eligibilitySchema,
  submissionSchema,
  type Certificate,
  type Eligibility,
  type Page,
  type Submission,
  certificateQuerySchema,
  submissionQuerySchema,
} from "@gurukulam/contracts";
import { apiFetch } from "@/server/api";
import { fetchPage, PAGE_KEYS, queryString, type SearchParams } from "@/server/list";

export const CERTIFICATE_FILTERS = [
  ...PAGE_KEYS,
  "studentId",
  "batchId",
  "courseId",
  "collegeId",
  "status",
  "segment",
] as const;

/**
 * Issued on completion in both segments; who may download differs.
 * A retail student downloads their own; for a college student the institution
 * does (invariant 7). The admin sees both.
 */
export async function listCertificates(params: SearchParams): Promise<Page<Certificate>> {
  return fetchPage(
    "/certificates",
    certificateSchema,
    params,
    CERTIFICATE_FILTERS,
    certificateQuerySchema,
  );
}

export async function getCertificate(certificateId: string): Promise<Certificate> {
  return certificateSchema.parse(await apiFetch(`/certificates/${certificateId}`));
}

/**
 * Whether this student may be signed off for this batch, and what is in the
 * way if not.
 *
 * Read BEFORE the issue form is shown rather than after it is submitted: the
 * point of the screen is that nobody signs off blind, and a blocker discovered
 * on submit is a blocker the operator never had the chance to weigh.
 */
export async function checkEligibility(studentId: string, batchId: string): Promise<Eligibility> {
  const query = queryString({ studentId, batchId }, ["studentId", "batchId"]);
  return eligibilitySchema.parse(await apiFetch(`/certificates/eligibility${query}`));
}

export const SUBMISSION_FILTERS = [...PAGE_KEYS, "collegeId", "batchId", "status"] as const;

/**
 * The lists colleges send (invariant 18).
 *
 * A certificate reaches a college ONLY through an approved submission. An
 * uploaded name is not a certificate — it is a claim, and this is the queue
 * where somebody checks it.
 */
export async function listSubmissions(params: SearchParams): Promise<Page<Submission>> {
  return fetchPage(
    "/certificates/submissions",
    submissionSchema,
    params,
    SUBMISSION_FILTERS,
    submissionQuerySchema,
  );
}

/** One submission with its rows, each carrying its own eligibility. */
export async function getSubmission(submissionId: string): Promise<Submission> {
  return submissionSchema.parse(await apiFetch(`/certificates/submissions/${submissionId}`));
}
