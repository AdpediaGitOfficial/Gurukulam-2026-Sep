"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  citySchema,
  countrySchema,
  createCitySchema,
  createCountrySchema,
} from "@gurukulam/contracts";

import { apiFetch, checkShape } from "@/server/api";
import { apiFormError, fieldErrors, text } from "@/lib/action";
import { formError, type FormState } from "@/lib/form";

/**
 * A country is set up once and referenced everywhere — its dial code, currency
 * and timezone become defaults on every record beneath it.
 */
export async function createCountry(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = createCountrySchema.safeParse({
    name: text(formData, "name"),
    iso2: text(formData, "iso2"),
    iso3: text(formData, "iso3"),
    dialCode: text(formData, "dialCode"),
    currency: text(formData, "currency"),
    timezone: text(formData, "timezone"),
  });
  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  try {
    checkShape(
      countrySchema,
      await apiFetch("/localisation/countries", { method: "POST", body: parsed.data }),
      "POST /localisation/countries",
    );
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath("/settings/countries");
  redirect("/settings/countries?created=1");
}

/**
 * A city is not just a label: it is what scopes a regional sub-admin's access,
 * so adding one widens the vocabulary the permission model draws on.
 */
export async function createCity(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = createCitySchema.safeParse({
    countryId: text(formData, "countryId"),
    name: text(formData, "name"),
    state: text(formData, "state"),
    timezone: text(formData, "timezone"),
  });
  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  try {
    checkShape(
      citySchema,
      await apiFetch("/localisation/cities", { method: "POST", body: parsed.data }),
      "POST /localisation/cities",
    );
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath("/settings/cities");
  redirect("/settings/cities?created=1");
}
