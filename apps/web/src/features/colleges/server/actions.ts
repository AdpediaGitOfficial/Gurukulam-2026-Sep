"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { collegeSchema, createCollegeSchema } from "@gurukulam/contracts";

import { apiFetch, checkShape } from "@/server/api";
import { apiFormError, fieldErrors, text } from "@/lib/action";
import { formError, type FormState } from "@/lib/form";

/**
 * Creates the institution and its first point of contact together.
 *
 * A college with no contact is a directory row, not an actor — there is nobody
 * to raise a requirement or approve certificate names — so the first contact is
 * collected here rather than left to a second screen someone may not reach.
 */
export async function createCollege(_previous: FormState, formData: FormData): Promise<FormState> {
  const contactName = text(formData, "pocName");
  const contactEmail = text(formData, "pocEmail");

  const parsed = createCollegeSchema.safeParse({
    name: text(formData, "name"),
    shortName: text(formData, "shortName"),
    countryId: text(formData, "countryId"),
    cityId: text(formData, "cityId"),
    addressLine1: text(formData, "addressLine1"),
    postalCode: text(formData, "postalCode"),
    website: text(formData, "website") ?? "",
    affiliation: text(formData, "affiliation"),
    // Typed as a comma-separated line, which is how an operator thinks of them.
    disciplines:
      text(formData, "disciplines")
        ?.split(",")
        .map((d) => d.trim())
        .filter(Boolean) ?? [],
    notes: text(formData, "notes"),
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
      await apiFetch("/colleges", { method: "POST", body: parsed.data }),
      "POST /colleges",
    );
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath("/colleges");
  redirect("/colleges?created=1");
}
