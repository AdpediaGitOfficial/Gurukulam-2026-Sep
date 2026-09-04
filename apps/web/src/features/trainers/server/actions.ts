"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createTrainerSchema, trainerSchema } from "@gurukulam/contracts";

import { apiFetch, checkShape } from "@/server/api";
import { apiFormError, fieldErrors, number, text } from "@/lib/action";
import { formError, type FormState } from "@/lib/form";

/**
 * Approved courses are collected here because they are what makes a trainer
 * assignable: a trainer can only take a batch of a course they are approved
 * for, so one with none cannot be assigned to anything.
 */
export async function createTrainer(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = createTrainerSchema.safeParse({
    name: text(formData, "name"),
    email: text(formData, "email"),
    phone: text(formData, "phone"),
    qualification: text(formData, "qualification"),
    experienceYears: number(formData, "experienceYears"),
    skillTags:
      text(formData, "skillTags")
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean) ?? [],
    payModel: text(formData, "payModel"),
    payRate: text(formData, "payRate"),
    maxWeeklyHours: number(formData, "maxWeeklyHours"),
    cityId: text(formData, "cityId"),
  });

  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  let trainerId: string | undefined;
  try {
    const created = await apiFetch<{ trainerId?: string }>("/trainers", {
      method: "POST",
      body: parsed.data,
    });
    checkShape(trainerSchema, created, "POST /trainers");
    trainerId = created.trainerId;
  } catch (error) {
    return apiFormError(error);
  }

  // Approvals are a separate endpoint. A failure here leaves a real trainer who
  // simply cannot be assigned yet, so it is reported rather than swallowed —
  // and never rolled into a claim that the trainer was not created.
  const courseIds = formData.getAll("courseIds").map(String).filter(Boolean);
  if (trainerId !== undefined && courseIds.length > 0) {
    try {
      await apiFetch(`/trainers/${trainerId}/courses`, { method: "PUT", body: { courseIds } });
    } catch {
      revalidatePath("/trainers");
      redirect(`/trainers?created=1&approvals=failed`);
    }
  }

  revalidatePath("/trainers");
  redirect("/trainers?created=1");
}
