"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  batchSchema,
  batchSessionSchema,
  batchStatusSchema,
  createBatchSchema,
  createSessionSchema,
  linkRecordingSchema,
  releaseTrainerSchema,
  respondToProposalSchema,
} from "@gurukulam/contracts";

import { apiFetch, checkShape } from "@/server/api";
import { apiFormError, checked, clearable, fieldErrors, number, text } from "@/lib/action";
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

/**
 * Records the trainer's answer to an open proposal.
 *
 * An admin may record it on their behalf: the admin portal performs every
 * action the deferred trainer portal will, permanently, because an operations
 * team needs the override regardless.
 *
 * Confirming makes the batch's primary trainer and commits its sessions;
 * declining returns the batch to unassigned and keeps the reason, so whoever
 * proposes next knows what happened. Nothing is reassigned automatically.
 */
export async function respondToProposal(
  batchId: string,
  decision: "CONFIRM" | "DECLINE",
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = respondToProposalSchema.safeParse({
    decision,
    // Only a decline carries one, and the contract requires it there.
    ...(decision === "DECLINE" ? { reason: text(formData, "reason") } : {}),
  });
  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  try {
    await apiFetch(`/batches/${batchId}/trainer/respond`, { method: "POST", body: parsed.data });
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath(`/batches/${batchId}`);
  redirect(`/batches/${batchId}?${decision === "CONFIRM" ? "confirmed" : "declined"}=1`);
}

/**
 * Releases the batch's trainer, so someone else can be put forward.
 *
 * Withdrawing an open proposal takes nothing away. Releasing a CONFIRMED
 * trainer does: the batch loses its primary trainer and its scheduled sessions
 * are cleared, which is why this is a deliberate act with its own control
 * rather than a side effect of editing the batch.
 */
export async function releaseTrainer(
  batchId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = releaseTrainerSchema.safeParse({ reason: text(formData, "reason") });
  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  try {
    await apiFetch(`/batches/${batchId}/trainer/propose`, {
      method: "DELETE",
      body: parsed.data,
    });
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath(`/batches/${batchId}`);
  redirect(`/batches/${batchId}?released=1`);
}

/**
 * Schedules a session under a batch.
 *
 * A session belongs to a batch and is taught against a topic OF THAT BATCH'S
 * COURSE — the API refuses any other topic, because a session mapped to a
 * foreign topic makes the curriculum report meaningless.
 *
 * Nothing stops a date in the past. Backdating is how a batch that started two
 * months ago gets its history recorded, and refusing it would make the console
 * unusable for exactly the cohorts most in need of catching up.
 */
export async function createSession(
  batchId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = createSessionSchema.safeParse({
    batchId,
    topicId: text(formData, "topicId"),
    trainerId: text(formData, "trainerId"),
    title: text(formData, "title"),
    scheduledDate: text(formData, "scheduledDate"),
    startTime: text(formData, "startTime"),
    endTime: text(formData, "endTime"),
    mode: text(formData, "mode"),
    venue: text(formData, "venue"),
    meetingLink: text(formData, "meetingLink") ?? "",
  });
  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  try {
    checkShape(
      batchSessionSchema,
      await apiFetch("/batches/sessions", { method: "POST", body: parsed.data }),
      "POST /batches/sessions",
    );
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath(`/batches/${batchId}`);
  redirect(`/batches/${batchId}?session=1`);
}

/**
 * Marks a session delivered.
 *
 * A deliberate act, not a date passing (invariant 10): it is what releases
 * assignments against the session and what makes a missing recording a gap
 * rather than a session that has not happened yet.
 */
export async function completeSession(
  sessionId: string,
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  try {
    await apiFetch(`/batches/sessions/${sessionId}/complete`, { method: "POST", body: {} });
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath(`/batches/sessions/${sessionId}`);
  redirect(`/batches/sessions/${sessionId}?completed=1`);
}

/** Completion is a human judgement, so it can be undone. */
export async function reopenSession(
  sessionId: string,
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  try {
    await apiFetch(`/batches/sessions/${sessionId}/reopen`, { method: "POST", body: {} });
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath(`/batches/sessions/${sessionId}`);
  redirect(`/batches/sessions/${sessionId}?reopened=1`);
}

/**
 * Attaches the recording of a delivered session.
 *
 * A YouTube URL is what the operator has to hand, so that is the default —
 * the contract accepts S3 and Zoom too, and stores which it is rather than
 * guessing from the URL later.
 */
export async function linkRecording(
  sessionId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = linkRecordingSchema.safeParse({
    url: text(formData, "url"),
    title: text(formData, "title"),
    provider: text(formData, "provider") ?? "YOUTUBE",
    isPublished: checked(formData, "isPublished"),
  });
  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  try {
    await apiFetch(`/batches/sessions/${sessionId}/recording`, {
      method: "POST",
      body: parsed.data,
    });
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath(`/batches/sessions/${sessionId}`);
  redirect(`/batches/sessions/${sessionId}?recorded=1`);
}
