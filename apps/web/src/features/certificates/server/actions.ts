"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  certificateSchema,
  createSubmissionSchema,
  decideRowSchema,
  issueCertificateSchema,
  revokeCertificateSchema,
  submissionSchema,
  type Certificate,
  type Submission,
} from "@gurukulam/contracts";

import { apiFetch, checkShape } from "@/server/api";
import { apiFormError, checked, fieldErrors, text } from "@/lib/action";
import { formError, type FormState } from "@/lib/form";

/**
 * Issuing directly — the retail path, and the override for any.
 *
 * Eligibility is checked by the API and shown by the screen BEFORE this runs,
 * so an override here is a decision somebody made looking at the blockers,
 * not one they backed into. The API refuses an override with no reason, which
 * is what keeps "override" from becoming the button everybody presses.
 */
export async function issueCertificate(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = issueCertificateSchema.safeParse({
    studentId: text(formData, "studentId"),
    batchId: text(formData, "batchId"),
    overrideBlockers: checked(formData, "overrideBlockers"),
    overrideReason: text(formData, "overrideReason"),
  });
  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  let issued: Certificate;
  try {
    issued = await apiFetch<Certificate>("/certificates", { method: "POST", body: parsed.data });
    checkShape(certificateSchema, issued, "POST /certificates");
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath("/students/certificates");
  revalidatePath(`/students/${parsed.data.studentId}`);
  redirect(`/students/certificates/${issued.certificateId}?issued=1`);
}

/**
 * Revocation, which takes effect on the public verifier immediately — the
 * verifier reads the row, so there is no cached copy to expire.
 *
 * There is no delete. A certificate that was issued was issued, and the
 * correction is a revocation carrying a reason, because somebody holding the
 * paper copy deserves to know why it stopped verifying.
 */
export async function revokeCertificate(
  certificateId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = revokeCertificateSchema.safeParse({ reason: text(formData, "reason") });
  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  try {
    const revoked = await apiFetch(`/certificates/${certificateId}/revoke`, {
      method: "POST",
      body: parsed.data,
    });
    checkShape(certificateSchema, revoked, "POST /certificates/:id/revoke");
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath("/students/certificates");
  revalidatePath(`/students/certificates/${certificateId}`);
  redirect(`/students/certificates/${certificateId}?revoked=1`);
}

// ── Submissions (invariant 18) ────────────────────────────────────────────

/**
 * One name per line, as a college actually sends them.
 *
 * `Name, email, reference` — and a line with just a name is legitimate,
 * because that is what a college secretary types. The email and reference
 * exist to MATCH the name to a student record later; they are not required to
 * make the claim, only to make it easy to check.
 */
function parseNames(raw: string): Array<{ name: string; email?: string; ref?: string }> {
  const rows: Array<{ name: string; email?: string; ref?: string }> = [];
  for (const line of raw.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const [name = "", email = "", ref = ""] = line.split(",").map((cell) => cell.trim());
    if (name === "") continue;
    rows.push({
      name,
      ...(email === "" ? {} : { email }),
      ...(ref === "" ? {} : { ref }),
    });
  }
  return rows;
}

/**
 * A college's list of names, logged against one training.
 *
 * The college is taken from the ROUTE, never the form: an admin filing on an
 * institution's behalf is already looking at that institution, and a college
 * id in a posted field is a way to file a list against somebody else.
 */
export async function createSubmission(
  collegeId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const names = parseNames(formData.get("names")?.toString() ?? "");
  const parsed = createSubmissionSchema.safeParse({
    batchId: text(formData, "batchId"),
    names,
  });
  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  let created: Submission;
  try {
    created = await apiFetch<Submission>("/certificates/submissions", {
      method: "POST",
      body: { ...parsed.data, collegeId },
    });
    checkShape(submissionSchema, created, "POST /certificates/submissions");
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath("/colleges/submissions");
  redirect(`/colleges/submissions/${created.submissionId}?created=1`);
}

/**
 * One decision, on one uploaded name.
 *
 * Approving REQUIRES a matched student — an uploaded name is a claim, and a
 * certificate has to name a record. Rejecting requires a reason, so the
 * college can correct the list rather than guess at it. Both rules live in the
 * contract; this hands their messages back to the row that broke them.
 */
export async function decideSubmissionRow(
  submissionId: string,
  rowId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = decideRowSchema.safeParse({
    decision: text(formData, "decision"),
    studentId: text(formData, "studentId"),
    reason: text(formData, "reason"),
    overrideBlockers: checked(formData, "overrideBlockers"),
  });
  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  try {
    await apiFetch(`/certificates/submissions/rows/${rowId}/decide`, {
      method: "POST",
      body: parsed.data,
    });
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath(`/colleges/submissions/${submissionId}`);
  return { status: "idle" };
}

/**
 * Approved rows become certificates here, and ONLY here (invariant 18).
 *
 * The API refuses while any name is still undecided, and refuses a submission
 * where nothing was approved — so this is the one irreversible step, and the
 * screen asks before taking it.
 */
export async function releaseSubmission(
  submissionId: string,
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  try {
    await apiFetch(`/certificates/submissions/${submissionId}/release`, {
      method: "POST",
      body: {},
    });
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath(`/colleges/submissions/${submissionId}`);
  revalidatePath("/colleges/submissions");
  revalidatePath("/students/certificates");
  redirect(`/colleges/submissions/${submissionId}?released=1`);
}
