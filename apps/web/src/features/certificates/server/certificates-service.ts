import "server-only";
import {
  certificateSchema,
  eligibilitySchema,
  verificationSchema,
  submissionSchema,
  type Certificate,
  type Eligibility,
  type Page,
  type Submission,
  type Verification,
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

/**
 * The public check: is this code a real certificate, right now.
 *
 * ── Why `anonymous` ─────────────────────────────────────────────────────
 *
 * The reader is an employer, not a user. Requiring a sign-in to confirm
 * somebody else's qualification would mean the only people who can verify a
 * certificate are the people who issued it — which is the opposite of what
 * verifying is for. The API's route is `@Public` for the same reason.
 *
 * ── Why nothing here interprets the answer ──────────────────────────────
 *
 * The API decides which codes say anything about a person: one it does not hold
 * and one belonging to a certificate that was never issued come back as the same
 * empty answer, while a withdrawn one answers with its number and date. Those
 * are deliberate disclosure decisions, and this seam is the natural place to
 * accidentally undo them. It passes the answer through.
 *
 * Not cached. A revocation has to be visible the moment it happens, and a
 * verifier that answers from a minute ago is a verifier for the wrong minute.
 */
export async function verifyCertificate(code: string): Promise<Verification> {
  const verification = await apiFetch<Verification>(
    `/certificates/verify/${encodeURIComponent(code)}`,
    { anonymous: true, onNotFound: "throw" },
  );
  return verificationSchema.parse(verification);
}
