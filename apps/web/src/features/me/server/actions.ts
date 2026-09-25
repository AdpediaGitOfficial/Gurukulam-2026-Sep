"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { submitAssignmentSchema, updateMeSchema } from "@gurukulam/contracts";

import { apiFetch } from "@/server/api";
import { apiFormError, fieldErrors, text } from "@/lib/action";
import { formError, type FormState } from "@/lib/form";

/**
 * The narrow edit a student may make to their own record.
 *
 * ── Why the field list is spelled out ───────────────────────────────────
 *
 * Not a spread of the form. A key this function does not name cannot be
 * written whatever arrives in the body, and the fields it does not name are
 * each absent for a reason the screen shows rather than hides: the name is
 * printed on the certificate, the email is how a fee reminder finds its
 * recipient (invariant 6), and the student code and college are identity.
 *
 * Empty is meaningful and is not the same as absent: a person clearing their
 * alternate number is a real thing to want, and the API turns an empty string
 * into NULL rather than storing one.
 */
export async function updateMyDetails(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = updateMeSchema.safeParse({
    phone: text(formData, "phone") ?? "",
    altPhone: text(formData, "altPhone") ?? "",
    addressLine1: text(formData, "addressLine1") ?? "",
    addressLine2: text(formData, "addressLine2") ?? "",
    postalCode: text(formData, "postalCode") ?? "",
  });
  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  try {
    await apiFetch("/me", { method: "PATCH", body: parsed.data });
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath("/portal/account");
  redirect("/portal/account?saved=1");
}

/**
 * Handing work in.
 *
 * ── Why the id is bound rather than posted ──────────────────────────────
 *
 * The form carries no `assignmentId` field. A hidden input would be a value
 * the browser can edit, and while the API refuses an assignment that is not on
 * one of this student's batches, a form that cannot express the wrong id is a
 * better place for that to be true than a check downstream. The card binds the
 * id when it renders the form.
 *
 * ── Why the success path redirects to the same screen ───────────────────
 *
 * There is nowhere better to go: what a student wants after handing in is to
 * see that it went in. `?handed-in=` names the assignment so the page can
 * confirm THAT one rather than a generic "saved" — with four pieces of work on
 * the screen, a banner that does not say which is a banner that has to be
 * trusted.
 */
export async function submitAssignment(
  assignmentId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = submitAssignmentSchema.safeParse({
    fileUrl: text(formData, "fileUrl") ?? "",
    contentText: text(formData, "contentText") ?? "",
  });
  if (!parsed.success) {
    return formError("Check what you are handing in.", fieldErrors(parsed.error.issues));
  }

  try {
    await apiFetch(`/me/assignments/${encodeURIComponent(assignmentId)}/submit`, {
      method: "POST",
      body: parsed.data,
    });
  } catch (error) {
    // A closed assignment and an already-marked one both land here as a
    // conflict, and both are things the student can see on their own screen —
    // so the API's own sentence is shown rather than a generic failure.
    return apiFormError(error);
  }

  revalidatePath("/portal/assignments");
  revalidatePath("/portal");
  redirect(`/portal/assignments?handed-in=${encodeURIComponent(assignmentId)}`);
}
