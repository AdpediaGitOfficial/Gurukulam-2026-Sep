"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { batchSchema, createBatchSchema } from "@gurukulam/contracts";

import { apiFetch, checkShape } from "@/server/api";
import { apiFormError, fieldErrors, number, text } from "@/lib/action";
import { formError, type FormState } from "@/lib/form";

/**
 * Creates a retail batch.
 *
 * A college batch is not created here: it comes from confirming that college's
 * requirement, which is what keeps the batch tied to the ask that produced it.
 * Omitting the college is what makes this batch retail, and retail and college
 * rosters never mix.
 */
export async function createBatch(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = createBatchSchema.safeParse({
    name: text(formData, "name"),
    courseId: text(formData, "courseId"),
    cityId: text(formData, "cityId"),
    mode: text(formData, "mode") ?? "OFFLINE",
    startDate: text(formData, "startDate"),
    endDate: text(formData, "endDate"),
    maxCapacity: number(formData, "maxCapacity"),
    venue: text(formData, "venue"),
    meetingLink: text(formData, "meetingLink") ?? "",
    notes: text(formData, "notes"),
  });

  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  let batchId: string | undefined;
  try {
    const created = await apiFetch<{ batchId?: string }>("/batches", {
      method: "POST",
      body: parsed.data,
    });
    checkShape(batchSchema, created, "POST /batches");
    batchId = created.batchId;
  } catch (error) {
    return apiFormError(error);
  }

  /*
   * A trainer is proposed, not assigned. The proposal is a separate call and a
   * separate state — it is not a commitment until the trainer confirms — so a
   * failure here leaves a real batch with nobody proposed rather than no batch.
   */
  const trainerId = text(formData, "trainerId");
  if (batchId !== undefined && trainerId !== undefined) {
    try {
      await apiFetch(`/batches/${batchId}/trainer/propose`, {
        method: "POST",
        body: { trainerId },
      });
    } catch {
      revalidatePath("/batches");
      redirect("/batches?created=1&trainer=failed");
    }
  }

  revalidatePath("/batches");
  redirect("/batches?created=1");
}
