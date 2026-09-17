"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  citySchema,
  countrySchema,
  createCitySchema,
  createCountrySchema,
} from "@gurukulam/contracts";

import { apiFetch, checkShape } from "@/server/api";
import { apiFormError, checked, clearable, fieldErrors, text } from "@/lib/action";
import { formError, type FormState } from "@/lib/form";

/*
 * Create and edit are the same act with a different verb, so they are one
 * action each: the form is identical apart from what it starts with and where
 * it posts, and splitting them would be two places to keep in step.
 *
 * The edit schemas are built here rather than reusing the contract's `update`
 * variants. Those are fully partial — every field optional — because a PATCH
 * may legitimately carry one field. This form carries all of them, so a
 * cleared name is an operator's mistake, not an omission: validating against a
 * partial schema would accept the blank, send nothing, and report success
 * while the old name stayed put.
 */

const editCountrySchema = createCountrySchema
  .omit({ iso2: true })
  .extend({ isActive: z.boolean() });

const editCitySchema = createCitySchema
  .omit({ countryId: true })
  .extend({ isActive: z.boolean() });

/**
 * A country is set up once and referenced everywhere — its dial code, currency
 * and timezone become defaults on every record beneath it.
 *
 * `iso2` is absent from the edit path: `country_code` is derived from it and
 * issued once, so changing it would break the identifier it produced.
 */
export async function saveCountry(
  countryId: string | undefined,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const editing = countryId !== undefined;
  const shared = {
    name: text(formData, "name"),
    iso3: text(formData, "iso3"),
    dialCode: text(formData, "dialCode"),
    currency: text(formData, "currency"),
    timezone: text(formData, "timezone"),
  };

  const parsed = editing
    ? editCountrySchema.safeParse({ ...shared, isActive: checked(formData, "isActive") })
    : createCountrySchema.safeParse({ ...shared, iso2: text(formData, "iso2") });
  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  try {
    checkShape(
      countrySchema,
      await apiFetch(editing ? `/localisation/countries/${countryId}` : "/localisation/countries", {
        method: editing ? "PATCH" : "POST",
        body: parsed.data,
      }),
      editing ? "PATCH /localisation/countries/:id" : "POST /localisation/countries",
    );
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath("/settings/countries");
  redirect(`/settings/countries?${editing ? "saved" : "created"}=1`);
}

/**
 * A city is not just a label: it is what scopes a regional sub-admin's access.
 *
 * Its country cannot change. Moving a city between countries would silently
 * re-scope every operator, college and student under it, so the contract omits
 * the field on update and the form shows it locked rather than hiding it — an
 * operator who cannot find a field assumes the screen is broken.
 *
 * State and timezone are read as clearable: an operator emptying one means to
 * empty it, and `text` would collapse that to "leave it alone".
 */
export async function saveCity(
  cityId: string | undefined,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const editing = cityId !== undefined;
  const name = text(formData, "name");

  const parsed = editing
    ? editCitySchema.safeParse({
        name,
        state: clearable(formData, "state"),
        timezone: clearable(formData, "timezone"),
        isActive: checked(formData, "isActive"),
      })
    : createCitySchema.safeParse({
        name,
        state: text(formData, "state"),
        timezone: text(formData, "timezone"),
        countryId: text(formData, "countryId"),
      });
  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  try {
    checkShape(
      citySchema,
      await apiFetch(editing ? `/localisation/cities/${cityId}` : "/localisation/cities", {
        method: editing ? "PATCH" : "POST",
        body: parsed.data,
      }),
      editing ? "PATCH /localisation/cities/:id" : "POST /localisation/cities",
    );
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath("/settings/cities");
  redirect(`/settings/cities?${editing ? "saved" : "created"}=1`);
}
