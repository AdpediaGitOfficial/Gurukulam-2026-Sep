"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createTrainerSchema,
  declareAvailabilitySchema,
  suspendTrainerSchema,
  trainerAccessSchema,
  trainerSchema,
} from "@gurukulam/contracts";

import { apiFetch, checkShape } from "@/server/api";
import { apiFormError, checked, clearable, fieldErrors, number, text } from "@/lib/action";
import { formError, type FormState } from "@/lib/form";

/*
 * Built from the create schema rather than the contract's partial update, for
 * the same reason as everywhere else: this form posts every field, so a blank
 * required one is a mistake to report.
 */
const editTrainerSchema = createTrainerSchema.extend({
  accountStatus: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
});

/**
 * Approved courses are collected here because they are what makes a trainer
 * assignable: a trainer can only take a batch of a course they are approved
 * for, so one with none cannot be assigned to anything.
 *
 * They travel by their own endpoint, which diffs rather than replaces —
 * approvals that did not change keep their row and their granted date — so it
 * is safe to send on every save.
 */
export async function saveTrainer(
  trainerId: string | undefined,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const editing = trainerId !== undefined;
  const optional = editing
    ? (key: string) => clearable(formData, key)
    : (key: string) => text(formData, key);

  const body = {
    name: text(formData, "name"),
    email: text(formData, "email"),
    phone: optional("phone"),
    qualification: optional("qualification"),
    experienceYears: number(formData, "experienceYears"),
    skillTags:
      text(formData, "skillTags")
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean) ?? [],
    engagement: text(formData, "engagement"),
    payModel: text(formData, "payModel"),
    payRate: optional("payRate"),
    maxWeeklyHours: number(formData, "maxWeeklyHours"),
    cityId: text(formData, "cityId"),
  };

  const parsed = editing
    ? editTrainerSchema.safeParse({ ...body, accountStatus: text(formData, "accountStatus") })
    : createTrainerSchema.safeParse(body);

  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  let id = trainerId;
  try {
    const saved = await apiFetch<{ trainerId?: string }>(
      editing ? `/trainers/${trainerId}` : "/trainers",
      { method: editing ? "PATCH" : "POST", body: parsed.data },
    );
    checkShape(trainerSchema, saved, editing ? "PATCH /trainers/:id" : "POST /trainers");
    id = saved.trainerId ?? id;
  } catch (error) {
    return apiFormError(error);
  }

  // Approvals are a separate endpoint. A failure here leaves a real trainer who
  // simply cannot be assigned yet, so it is reported rather than swallowed —
  // and never rolled into a claim that the trainer was not saved.
  const courseIds = formData.getAll("courseIds").map(String).filter(Boolean);
  if (id !== undefined && (editing || courseIds.length > 0)) {
    try {
      await apiFetch(`/trainers/${id}/courses`, { method: "PUT", body: { courseIds } });
    } catch {
      revalidatePath("/trainers");
      redirect(`/trainers?${editing ? "saved" : "created"}=1&approvals=failed`);
    }
  }

  revalidatePath("/trainers");
  redirect(`/trainers?${editing ? "saved" : "created"}=1`);
}

/**
 * Suspends a trainer.
 *
 * Withdraws them from the pickers — the calendar lists only active trainers,
 * and a proposal is refused for anyone else — without touching the batches
 * they are already confirmed on. Pulling someone off live delivery as a side
 * effect of a status change would strand those cohorts.
 */
export async function suspendTrainer(
  trainerId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = suspendTrainerSchema.safeParse({ reason: text(formData, "reason") });
  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  try {
    checkShape(
      trainerSchema,
      await apiFetch(`/trainers/${trainerId}/suspend`, { method: "POST", body: parsed.data }),
      "POST /trainers/:id/suspend",
    );
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath(`/trainers/${trainerId}`);
  redirect(`/trainers/${trainerId}?suspended=1`);
}

/**
 * Issues portal access.
 *
 * ── Why it is an operator's act and not a consequence of being added ────
 *
 * A trainer record exists long before there is anything to sign in to — a CV
 * goes on the bench and may never take a batch. Issuing at creation would mean
 * every candidate on file holds a live account, and the notification sweep
 * already raises "credentials issued but never used" as an operator situation
 * for exactly that shape of mistake.
 *
 * The API refuses a second issue by name, because a new temporary password
 * invalidates the one the person is holding. Resetting is a different act and
 * the operator should know which one they are doing.
 *
 * Nothing here handles a password. The temporary secret is neither returned nor
 * logged — the login address is the only thing there is to hand over.
 */
export async function issueTrainerAccess(
  trainerId: string,
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  try {
    checkShape(
      trainerAccessSchema,
      await apiFetch(`/trainers/${trainerId}/access`, { method: "POST", body: {} }),
      "POST /trainers/:id/access",
    );
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath(`/trainers/${trainerId}`);
  redirect(`/trainers/${trainerId}?access=issued`);
}

/** Clears the suspension and the reason with it. */
export async function reinstateTrainer(
  trainerId: string,
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  try {
    checkShape(
      trainerSchema,
      await apiFetch(`/trainers/${trainerId}/reinstate`, { method: "POST", body: {} }),
      "POST /trainers/:id/reinstate",
    );
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath(`/trainers/${trainerId}`);
  redirect(`/trainers/${trainerId}?reinstated=1`);
}

/**
 * Declaring a window the trainer is not available.
 *
 * The console could already DELETE an availability window and never create
 * one — you could withdraw leave you had no way to declare. This is the other
 * half.
 *
 * The API refuses a window that would cover a session the trainer is already
 * committed to, and says which one. That refusal is the point: a leave request
 * silently swallowing a confirmed delivery is how a cohort turns up to an
 * empty room.
 */
export async function declareAvailability(
  trainerId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  /*
   * A whole day is declared as a DATE and a part of one as a timestamp, which
   * is why the two bounds are widened here rather than in the component.
   *
   * The browser submits `2026-09-20` from a date input and `2026-09-20T14:00`
   * from a datetime-local one, and the API stores whatever it is given. Left
   * alone, a day of leave would land as midnight-to-midnight — an instant, not
   * a day — and the clash check, which compares against the whole of each
   * bounding day, would then let a session be scheduled into leave that was
   * declared over it. Widening to the day's real edges is what makes "the 20th"
   * mean the 20th.
   *
   * It happens server-side because it is a rule about what the record means,
   * not about how the form looks: a second caller composing this body by hand
   * gets the same treatment.
   */
  const fullDay = checked(formData, "isFullDay");
  const bound = (key: string, edge: "T00:00:00" | "T23:59:59") => {
    const value = text(formData, key);
    if (value === undefined) return value;
    return fullDay && !value.includes("T") ? `${value}${edge}` : value;
  };

  const parsed = declareAvailabilitySchema.safeParse({
    type: text(formData, "type") ?? "LEAVE",
    startsAt: bound("startsAt", "T00:00:00"),
    endsAt: bound("endsAt", "T23:59:59"),
    isFullDay: fullDay,
    reason: text(formData, "reason"),
  });
  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  try {
    await apiFetch(`/trainers/${trainerId}/availability`, {
      method: "POST",
      body: parsed.data,
    });
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath(`/trainers/${trainerId}`);
  revalidatePath("/trainers/calendar");
  redirect(`/trainers/${trainerId}?declared=1`);
}
