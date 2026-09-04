import { ApiRequestError } from "@/server/api";
import { formError, type FormState } from "@/lib/form";

/**
 * Turns a Zod failure into the field-keyed shape a form binds to.
 *
 * Nested paths become dotted keys (`advance.transactionId`), matching the input
 * names the forms use, so nothing has to be mapped on the way through.
 */
export function fieldErrors(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.join(".");
    if (key !== "" && fields[key] === undefined) fields[key] = issue.message;
  }
  return fields;
}

/**
 * The API's refusal, as a form state.
 *
 * Anything that is not an `ApiRequestError` is rethrown: a network failure or a
 * bug is not something an operator can fix by editing a field, and swallowing
 * it into the form would say otherwise.
 */
export function apiFormError(error: unknown): FormState {
  if (error instanceof ApiRequestError) {
    return formError(
      error.message,
      Object.keys(error.fields).length > 0 ? error.fields : undefined,
    );
  }
  throw error;
}

/** Reads a trimmed string from a form, or undefined when it was left blank. */
export function text(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** Reads a checkbox. An unchecked box is absent from the payload, not false. */
export function checked(formData: FormData, key: string): boolean {
  return formData.get(key) === "on";
}

/** Reads a number, or undefined when the field was left blank. */
export function number(formData: FormData, key: string): number | undefined {
  const value = text(formData, key);
  return value === undefined ? undefined : Number(value);
}

/**
 * Reads a field an operator is allowed to empty.
 *
 * `text` collapses a blank to `undefined`, which a PATCH reads as "leave it
 * alone" — correct for a field the form did not render, wrong for one the
 * operator deliberately cleared. This returns the empty string instead, which
 * the API stores as null.
 */
export function clearable(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}
