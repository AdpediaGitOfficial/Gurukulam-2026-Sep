"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  allocateStudentSchema,
  createRequirementSchema,
  createStudentSchema,
  createSubmissionSchema,
} from "@gurukulam/contracts";

import { apiFetch } from "@/server/api";
import { apiFormError, fieldErrors, number, text } from "@/lib/action";
import { formError, type FormState } from "@/lib/form";

/**
 * What an institution may do.
 *
 * ── The shape of this file is the security model, stated twice ──────────
 *
 * Four acts, and what is ABSENT is the point. There is no confirm, no reject,
 * no issue, no revoke, no decide, no release, no suspend, no deallocate and no
 * roster outcome, because none of those is the college's — each one calls
 * `assertOursToDecide` inside its API service and answers 403.
 *
 * The API is the protection; this file is the manners. A portal that offers a
 * button the server will refuse teaches the person in front of it that the
 * product is broken, and they are right to think so.
 *
 * Every one of these four posts to the SAME endpoint the console posts to, with
 * `collegeScope` applied inside the service. Not a parallel `/me/college/*`
 * write path: a second copy of "a student may only join a batch of their own
 * college" is how invariant 2 comes to be enforced in one place and not the
 * other.
 */

/**
 * Raising a requirement — the act that starts the whole college flow.
 *
 * `collegeId` is deliberately NOT posted. The service reads
 * `principal.collegeScope ?? input.collegeId`, so a college user raises one for
 * their own institution and cannot name another's even by editing the form.
 * Sending it would be harmless and is left out anyway, because a field the
 * server ignores is a field somebody later trusts.
 */
export async function raiseRequirement(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = createRequirementSchema.safeParse({
    courseId: text(formData, "courseId") ?? "",
    expectedHeadcount: number(formData, "expectedHeadcount") ?? 0,
    preferredMode: text(formData, "preferredMode") ?? "OFFLINE",
    preferredWindowStart: text(formData, "preferredWindowStart"),
    preferredWindowEnd: text(formData, "preferredWindowEnd"),
    discipline: text(formData, "discipline"),
    notes: text(formData, "notes"),
    // Recorded from the start so "who asked, and how" survives — a requirement
    // raised in the portal is a different fact from one an admin logged off a
    // phone call, and the reports read this column.
    source: "COLLEGE_PORTAL",
  });
  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  try {
    await apiFetch("/colleges/requirements", { method: "POST", body: parsed.data });
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath("/campus/requirements");
  revalidatePath("/campus");
  redirect("/campus/requirements?raised=1");
}

/**
 * Adding one of their own students.
 *
 * `collegeId` is not posted for the same reason as above, and here it matters
 * more: the service forces the college from the principal, which is what makes
 * invariant 2 hold for institutional intake — a student created here can only
 * ever join a batch carrying the same college.
 */
export async function addStudent(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = createStudentSchema.safeParse({
    firstName: text(formData, "firstName") ?? "",
    lastName: text(formData, "lastName"),
    email: text(formData, "email") ?? "",
    phone: text(formData, "phone"),
    dateOfBirth: text(formData, "dateOfBirth"),
    gender: text(formData, "gender"),
    discipline: text(formData, "discipline"),
    passoutYear: number(formData, "passoutYear"),
    qualification: text(formData, "qualification"),
  });
  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  try {
    await apiFetch("/students", { method: "POST", body: parsed.data });
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath("/campus/students");
  revalidatePath("/campus");
  redirect("/campus/students?added=1");
}

/**
 * Putting one of their students on one of their cohorts.
 *
 * ── Why no money crosses this form ──────────────────────────────────────
 *
 * `allocateStudentSchema` carries an enrolment value, an advance and a hand-
 * authored installment schedule, and all three are RETAIL. Invariant 3: a
 * college student has no individual ledger, and the institution is billed under
 * its contract instead. So this posts the batch and nothing else, and the
 * service builds no ledger for a college student.
 *
 * Credentials are issued, because that is what lets the student sign in to the
 * work their college enrolled them on.
 */
export async function allocateStudent(
  studentId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = allocateStudentSchema.safeParse({
    batchId: text(formData, "batchId") ?? "",
    installments: [],
    issueCredentials: true,
  });
  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  try {
    await apiFetch(`/students/${encodeURIComponent(studentId)}/allocate`, {
      method: "POST",
      body: parsed.data,
    });
  } catch (error) {
    // The roster rule is the API's to state: a batch of another college, or a
    // retail batch, is refused by name rather than filtered out of the picker
    // and forgotten about.
    return apiFormError(error);
  }

  revalidatePath("/campus/students");
  revalidatePath("/campus");
  redirect("/campus/students?allocated=1");
}

/**
 * Putting a list of names forward for certification.
 *
 * This is the college's half of invariant 18, and the only half that is theirs:
 * they say who they believe has finished, we review each name against its
 * eligibility, and release is what creates the certificates. A college that
 * could approve its own rows would be the flow with its only check removed —
 * so `decide` and `release` are refused by the API and absent from this file.
 *
 * One textarea, one name per line. A CSV upload is the console's import screen;
 * a TPO with thirty names has them in an email, and pasting is the shortest
 * path from that email to this list.
 */
export async function submitForCertificates(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const raw = text(formData, "names") ?? "";
  const names = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
    // `Name, email` is what people paste, so the comma is honoured rather than
    // becoming part of the name.
    .map((line) => {
      const [name, email] = line.split(",").map((part) => part.trim());
      return { name: name ?? line, ...(email ? { email } : {}) };
    });

  const parsed = createSubmissionSchema.safeParse({
    batchId: text(formData, "batchId") ?? "",
    names,
  });
  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  try {
    await apiFetch("/certificates/submissions", { method: "POST", body: parsed.data });
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath("/campus/certificates");
  revalidatePath("/campus");
  redirect("/campus/certificates?submitted=1");
}
