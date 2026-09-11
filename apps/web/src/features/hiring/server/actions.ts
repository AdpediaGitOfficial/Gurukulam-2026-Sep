"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createJobSchema, jobPostingSchema } from "@gurukulam/contracts";

import { apiFetch, checkShape } from "@/server/api";
import { apiFormError, fieldErrors, number, text } from "@/lib/action";
import { formError, type FormState } from "@/lib/form";

/**
 * Creates a job posting, as a DRAFT.
 *
 * Publishing is a second, deliberate act: a posting reaches every student its
 * audience rules match, and the reach is worth reading before it goes out
 * rather than after.
 *
 * Audience is evaluated at READ time and never materialised per student
 * (invariant 10) — so a rule written today also reaches students who enrol
 * next month, and a batch transfer cannot leave a stale grant behind.
 */
export async function createJob(_previous: FormState, formData: FormData): Promise<FormState> {
  // Course is the primary targeting axis; the rest of each row narrows it.
  const courseIds = formData.getAll("ruleCourseId").map(String);
  const segments = formData.getAll("ruleSegment").map(String);
  const years = formData.getAll("rulePassoutYear").map(String);
  const completed = formData.getAll("ruleCompletedOnly").map(String);

  const audienceRules = courseIds
    .map((courseId, index) => ({
      courseId: courseId.trim(),
      ...(segments[index] === undefined || segments[index] === ""
        ? {}
        : { segment: segments[index] }),
      ...(years[index] === undefined || years[index]?.trim() === ""
        ? {}
        : { passoutYear: Number(years[index]) }),
      // A checkbox absent from the payload is false, so the row's own hidden
      // marker carries the answer rather than the checkbox's presence.
      completedOnly: completed[index] === "on",
    }))
    .filter((rule) => rule.courseId !== "");

  const parsed = createJobSchema.safeParse({
    roleTitle: text(formData, "roleTitle"),
    companyName: text(formData, "companyName"),
    location: text(formData, "location"),
    workMode: text(formData, "workMode") ?? "ONSITE",
    experienceMinYears: number(formData, "experienceMinYears"),
    experienceMaxYears: number(formData, "experienceMaxYears"),
    compensationMin: text(formData, "compensationMin"),
    compensationMax: text(formData, "compensationMax"),
    compensationPeriod: text(formData, "compensationPeriod"),
    skills:
      text(formData, "skills")
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean) ?? [],
    description: text(formData, "description"),
    applyUrl: text(formData, "applyUrl") ?? "",
    applyEmail: text(formData, "applyEmail") ?? "",
    closingDate: text(formData, "closingDate"),
    audienceRules,
  });
  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  let jobPostingId: string | undefined;
  try {
    const created = await apiFetch<{ jobPostingId?: string }>("/hiring", {
      method: "POST",
      body: parsed.data,
    });
    checkShape(jobPostingSchema, created, "POST /hiring");
    jobPostingId = created.jobPostingId;
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath("/hiring");
  redirect(jobPostingId === undefined ? "/hiring?created=1" : `/hiring/${jobPostingId}?created=1`);
}

/**
 * Publishes a draft.
 *
 * Refused twice over: the API rejects a second publish, and a posting with no
 * audience rule reaches nobody — which is worth stopping rather than sending.
 */
export async function publishJob(
  jobPostingId: string,
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  try {
    await apiFetch(`/hiring/${jobPostingId}/publish`, { method: "POST", body: {} });
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath("/hiring");
  redirect(`/hiring/${jobPostingId}?published=1`);
}

/** Closes a posting. The record stays; it simply stops reaching anyone. */
export async function closeJob(
  jobPostingId: string,
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  try {
    await apiFetch(`/hiring/${jobPostingId}/status`, {
      method: "PATCH",
      body: { status: "CLOSED" },
    });
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath("/hiring");
  redirect(`/hiring/${jobPostingId}?closed=1`);
}
