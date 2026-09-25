"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { updateMeSchema } from "@gurukulam/contracts";

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
