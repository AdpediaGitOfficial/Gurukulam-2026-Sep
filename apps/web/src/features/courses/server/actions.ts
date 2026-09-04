"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { courseSchema, createCourseSchema } from "@gurukulam/contracts";

import { apiFetch, checkShape } from "@/server/api";
import { apiFormError, fieldErrors, number, text } from "@/lib/action";
import { formError, type FormState } from "@/lib/form";

/**
 * A course holds topics, and a topic carries sessions. The topics are collected
 * here because they are the course's structure, not a detail of it — a course
 * with none cannot have a batch scheduled against it in any meaningful way.
 */
export async function createCourse(_previous: FormState, formData: FormData): Promise<FormState> {
  const titles = formData.getAll("topicTitle").map(String);
  const hours = formData.getAll("topicHours").map(String);

  const parsed = createCourseSchema.safeParse({
    name: text(formData, "name"),
    shortName: text(formData, "shortName"),
    description: text(formData, "description"),
    category: text(formData, "category"),
    durationWeeks: number(formData, "durationWeeks"),
    durationHours: number(formData, "durationHours"),
    // Rupees as typed; the API parses to paise without touching a float.
    standardMarketValue: text(formData, "standardMarketValue"),
    syllabusUrl: text(formData, "syllabusUrl") ?? "",
    attendanceFloorPct: number(formData, "attendanceFloorPct"),
    topics: titles
      .map((title, index) => ({
        title: title.trim(),
        ...(hours[index] === undefined || hours[index].trim() === ""
          ? {}
          : { durationHours: Number(hours[index]) }),
      }))
      .filter((topic) => topic.title !== ""),
  });

  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  try {
    checkShape(
      courseSchema,
      await apiFetch("/courses", { method: "POST", body: parsed.data }),
      "POST /courses",
    );
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath("/courses");
  redirect("/courses?created=1");
}
