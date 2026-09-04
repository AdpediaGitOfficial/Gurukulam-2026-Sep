"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  collegeSchema,
  createCollegeSchema,
  grantPortalAccessSchema,
  issuedCredentialSchema,
  replacePocsSchema,
  type IssuedCredential,
} from "@gurukulam/contracts";

import { apiFetch, checkShape } from "@/server/api";
import { apiFormError, checked, clearable, fieldErrors, text } from "@/lib/action";
import { formError, type FormState } from "@/lib/form";
import type { GrantState } from "@/features/colleges/types";

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

/**
 * The college's contacts, as one list.
 *
 * Sent whole because the endpoint takes the whole list — but it diffs rather
 * than replaces, so a contact that only had its phone corrected keeps the id
 * a portal account may already be linked to.
 *
 * The rows arrive as parallel arrays, one entry per row the operator can see.
 * `pocId` is empty on a row they just added, which is exactly what tells the
 * API it is new. The primary arrives as one key rather than a flag per row:
 * a radio group cannot express two primaries, so the refusal never has to.
 */
export async function saveContacts(
  collegeId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const column = (key: string): string[] => formData.getAll(key).map(String);
  const keys = column("pocKey");
  const ids = column("pocId");
  const names = column("pocName");
  const designations = column("pocDesignation");
  const departments = column("pocDepartment");
  const emails = column("pocEmail");
  const phones = column("pocPhone");
  const primaryKey = formData.get("primaryKey");

  const at = (values: string[], index: number): string | undefined => {
    const value = values[index]?.trim();
    return value === undefined || value === "" ? undefined : value;
  };

  const parsed = replacePocsSchema.safeParse({
    pocs: keys.map((key, index) => ({
      // Undefined rather than empty: an id is either a real row or absent, and
      // "" would read as an id that belongs to nobody.
      ...(at(ids, index) === undefined ? {} : { pocId: at(ids, index) }),
      name: at(names, index),
      designation: at(designations, index),
      department: at(departments, index),
      email: at(emails, index),
      phone: at(phones, index),
      isPrimary: key === primaryKey,
    })),
  });

  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  try {
    await apiFetch(`/colleges/${collegeId}/contacts`, { method: "PUT", body: parsed.data });
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath(`/colleges/${collegeId}`);
  redirect(`/colleges/${collegeId}?contacts=1`);
}

/**
 * Grants portal access, or re-issues it.
 *
 * One endpoint does three jobs, because it matches on the contact's email
 * within the college: a first grant creates the account, a second REPLACES the
 * password of an existing one, and one against a revoked account restores it.
 * The screen names which of the three it is about to do — the endpoint cannot
 * be made to distinguish them without changing what it means.
 *
 * The temporary password comes back in the state rather than through a
 * redirect. Putting it in a query string would write it into browser history,
 * the proxy's access log and any onward `Referer`.
 */
export async function grantAccess(
  collegeId: string,
  _previous: GrantState,
  formData: FormData,
): Promise<GrantState> {
  const pocId = text(formData, "pocId");

  const parsed = grantPortalAccessSchema.safeParse({
    // A contact, or details typed directly for someone who is not one.
    ...(pocId === undefined ? {} : { pocId }),
    name: text(formData, "name"),
    email: text(formData, "email"),
    phone: text(formData, "phone"),
  });
  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  let issued: IssuedCredential;
  try {
    issued = issuedCredentialSchema.parse(
      await apiFetch(`/colleges/${collegeId}/access`, { method: "POST", body: parsed.data }),
    );
  } catch (error) {
    return apiFormError(error);
  }

  // Revalidated but NOT redirected: the credential is on this page now, and a
  // navigation would take it with it.
  revalidatePath(`/colleges/${collegeId}/access`);
  return { status: "idle", issued };
}

/**
 * Revokes portal access.
 *
 * Immediate: the account's status stops it authenticating, its live sessions
 * are revoked in the same transaction, and its password hash is cleared — so
 * restoring access issues a NEW password rather than reviving the old one.
 */
export async function revokeAccess(
  collegeId: string,
  collegeUserId: string,
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  try {
    await apiFetch(`/colleges/access/${collegeUserId}/revoke`, { method: "POST", body: {} });
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath(`/colleges/${collegeId}/access`);
  redirect(`/colleges/${collegeId}/access?revoked=1`);
}
