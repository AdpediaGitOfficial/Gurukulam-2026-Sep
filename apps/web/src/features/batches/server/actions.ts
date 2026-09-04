"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { batchSchema, batchStatusSchema, createBatchSchema } from "@gurukulam/contracts";

import { apiFetch, checkShape } from "@/server/api";
import { apiFormError, clearable, fieldErrors, number, text } from "@/lib/action";
import { formError, type FormState } from "@/lib/form";

/*
 * A batch cannot change its course or its college.
 *
 * Both are omitted from the contract's update and from this schema. The course
 * decides which trainers may take it and which topics its sessions hang off;
 * the college decides who may sit on the roster (invariant 2). Changing either
 * on a batch that already has students would silently invalidate the roster it
 * already has, so the form shows them locked rather than hiding them.
 */
const editBatchSchema = createBatchSchema
  .omit({ courseId: true, collegeId: true, requirementId: true })
  .extend({ status: batchStatusSchema });

/**
 * Creates a retail batch, or saves a correction to any batch.
 *
 * A college batch is not created here: it comes from confirming that college's
 * requirement, which is what keeps the batch tied to the ask that produced it.
 * Omitting the college is what makes this batch retail, and retail and college
 * rosters never mix.
 */
export async function saveBatch(
  batchId: string | undefined,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const editing = batchId !== undefined;
  const optional = editing
    ? (key: string) => clearable(formData, key)
    : (key: string) => text(formData, key);

  const body = {
    name: text(formData, "name"),
    cityId: text(formData, "cityId"),
    mode: text(formData, "mode") ?? "OFFLINE",
    startDate: text(formData, "startDate"),
    endDate: optional("endDate"),
    maxCapacity: number(formData, "maxCapacity"),
    venue: optional("venue"),
    meetingLink: text(formData, "meetingLink") ?? "",
    notes: optional("notes"),
  };

  const parsed = editing
    ? editBatchSchema.safeParse({ ...body, status: text(formData, "status") })
    : createBatchSchema.safeParse({ ...body, courseId: text(formData, "courseId") });

  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  let id = batchId;
  try {
    const saved = await apiFetch<{ batchId?: string }>(editing ? `/batches/${batchId}` : "/batches", {
      method: editing ? "PATCH" : "POST",
      body: parsed.data,
    });
    checkShape(batchSchema, saved, editing ? "PATCH /batches/:id" : "POST /batches");
    id = saved.batchId ?? id;
  } catch (error) {
    return apiFormError(error);
  }

  /*
   * A trainer is proposed, not assigned. The proposal is a separate call and a
   * separate state — it is not a commitment until the trainer confirms — so a
   * failure here leaves a real batch with nobody proposed rather than no batch.
   *
   * The form only offers the picker when nothing is open: the API refuses a
   * second proposal while one is proposed or confirmed, and withdrawing is a
   * deliberate act rather than a side effect of correcting a venue.
   */
  const trainerId = text(formData, "trainerId");
  if (id !== undefined && trainerId !== undefined) {
    try {
      await apiFetch(`/batches/${id}/trainer/propose`, {
        method: "POST",
        body: { trainerId },
      });
    } catch {
      revalidatePath("/batches");
      redirect(`/batches?${editing ? "saved" : "created"}=1&trainer=failed`);
    }
  }

  revalidatePath("/batches");
  redirect(`/batches?${editing ? "saved" : "created"}=1`);
}
