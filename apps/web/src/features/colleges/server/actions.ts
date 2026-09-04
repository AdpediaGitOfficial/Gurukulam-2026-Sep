"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { collegeSchema, createCollegeSchema } from "@gurukulam/contracts";

import { apiFetch, checkShape } from "@/server/api";
import { apiFormError, checked, clearable, fieldErrors, text } from "@/lib/action";
import { formError, type FormState } from "@/lib/form";

/*
 * The edit schema is built here rather than reusing the contract's
 * `updateCollegeSchema`. That one is fully partial — a PATCH may legitimately
 * carry a single field — but this form posts every field, so a cleared name is
 * a mistake to report, not an omission to ignore.
 *
 * `pocs` is absent on both paths for the same reason it is absent from the
 * contract's update: contacts are replaced wholesale through their own
 * endpoint, and folding them in here would silently drop every contact but the
 * first each time an operator corrected the address.
 */
const editCollegeSchema = createCollegeSchema
  .omit({ pocs: true })
  .extend({ isActive: z.boolean() });

/**
 * Creates the institution and its first point of contact together, or saves a
 * correction to the institution alone.
 *
 * A college with no contact is a directory row, not an actor — there is nobody
 * to raise a requirement or approve certificate names — so the first contact is
 * collected on create rather than left to a second screen someone may not reach.
 */
export async function saveCollege(
  collegeId: string | undefined,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const editing = collegeId !== undefined;
  const contactName = text(formData, "pocName");
  const contactEmail = text(formData, "pocEmail");

  // Read as clearable on edit: an operator emptying an address means to empty
  // it, and `text` would collapse that to "leave it alone".
  const optional = editing
    ? (key: string) => clearable(formData, key)
    : (key: string) => text(formData, key);

  const body = {
    name: text(formData, "name"),
    shortName: optional("shortName"),
    countryId: text(formData, "countryId"),
    cityId: text(formData, "cityId"),
    addressLine1: optional("addressLine1"),
    postalCode: optional("postalCode"),
    website: text(formData, "website") ?? "",
    affiliation: optional("affiliation"),
    // Typed as a comma-separated line, which is how an operator thinks of them.
    disciplines:
      text(formData, "disciplines")
        ?.split(",")
        .map((d) => d.trim())
        .filter(Boolean) ?? [],
    notes: optional("notes"),
  };

  const parsed = editing
    ? editCollegeSchema.safeParse({ ...body, isActive: checked(formData, "isActive") })
    : createCollegeSchema.safeParse({
        ...body,
        pocs:
          contactName === undefined || contactEmail === undefined
            ? []
            : [
                {
                  name: contactName,
                  email: contactEmail,
                  designation: text(formData, "pocDesignation"),
                  department: text(formData, "pocDepartment"),
                  phone: text(formData, "pocPhone"),
                  // The first contact is the primary one by definition.
                  isPrimary: true,
                },
              ],
      });

  if (!parsed.success) {
    const fields = fieldErrors(parsed.error.issues);
    // Contact errors arrive as `pocs.0.email`; the inputs are named `pocEmail`.
    for (const [key, message] of Object.entries(fields)) {
      const match = /^pocs\.0\.(\w+)$/.exec(key);
      if (match?.[1] !== undefined) {
        fields[`poc${match[1][0]?.toUpperCase()}${match[1].slice(1)}`] = message;
      }
    }
    return formError("Check the details below.", fields);
  }

  try {
    checkShape(
      collegeSchema,
      await apiFetch(editing ? `/colleges/${collegeId}` : "/colleges", {
        method: editing ? "PATCH" : "POST",
        body: parsed.data,
      }),
      editing ? "PATCH /colleges/:id" : "POST /colleges",
    );
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath("/colleges");
  if (editing) revalidatePath(`/colleges/${collegeId}`);
  redirect(editing ? `/colleges/${collegeId}?saved=1` : "/colleges?created=1");
}
