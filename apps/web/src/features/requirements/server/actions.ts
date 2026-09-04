"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  confirmRequirementSchema,
  rejectRequirementSchema,
  requirementSchema,
} from "@gurukulam/contracts";

import { apiFetch, ApiRequestError, checkShape } from "@/server/api";
import { formError, type FormState } from "@/lib/form";

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.join(".");
    if (key !== "" && fields[key] === undefined) fields[key] = issue.message;
  }
  return fields;
}

/**
 * Confirming a requirement is what creates its dedicated batch.
 *
 * The two are one act, not a batch created afterwards and linked back: the
 * requirement carries the batch it produced, which is what lets an operator ask
 * "what came of this ask?" and get an answer rather than a guess.
 *
 * The batch is dedicated to the college that raised it, so retail students can
 * never join it.
 */
export async function confirmRequirement(
  requirementId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const text = (key: string): string | undefined => {
    const value = formData.get(key);
    return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
  };
  const capacity = text("maxCapacity");

  const parsed = confirmRequirementSchema.safeParse({
    batchName: text("batchName"),
    startDate: text("startDate"),
    endDate: text("endDate"),
    mode: text("mode"),
    venue: text("venue"),
    meetingLink: text("meetingLink") ?? "",
    ...(capacity === undefined ? {} : { maxCapacity: Number(capacity) }),
  });

  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  try {
    // Returns the updated REQUIREMENT, not the batch — the requirement now
    // carries the batch it produced, which is the link worth having.
    checkShape(
      requirementSchema,
      await apiFetch(`/colleges/requirements/${requirementId}/confirm`, {
        method: "POST",
        body: parsed.data,
      }),
      "POST /colleges/requirements/:id/confirm",
    );
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return formError(error.message, Object.keys(error.fields).length > 0 ? error.fields : undefined);
    }
    throw error;
  }

  revalidatePath("/colleges/requirements");
  revalidatePath(`/colleges/requirements/${requirementId}`);
  revalidatePath("/batches");
  redirect(`/colleges/requirements/${requirementId}?confirmed=1`);
}

/**
 * Turning one down.
 *
 * The reason is required and travels with the record: a college that asked for
 * eighty seats and heard nothing back has no way to revise the ask.
 */
export async function rejectRequirement(
  requirementId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = rejectRequirementSchema.safeParse({ reason: formData.get("reason") });
  if (!parsed.success) return formError("Say why this is being turned down.", fieldErrors(parsed.error.issues));

  try {
    checkShape(
      requirementSchema,
      await apiFetch(`/colleges/requirements/${requirementId}/reject`, {
        method: "POST",
        body: parsed.data,
      }),
      "POST /colleges/requirements/:id/reject",
    );
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return formError(error.message, Object.keys(error.fields).length > 0 ? error.fields : undefined);
    }
    throw error;
  }

  revalidatePath("/colleges/requirements");
  revalidatePath(`/colleges/requirements/${requirementId}`);
  redirect(`/colleges/requirements/${requirementId}?rejected=1`);
}
