"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createTrainerSchema, trainerSchema } from "@gurukulam/contracts";

import { apiFetch, checkShape } from "@/server/api";
import { apiFormError, clearable, fieldErrors, number, text } from "@/lib/action";
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
