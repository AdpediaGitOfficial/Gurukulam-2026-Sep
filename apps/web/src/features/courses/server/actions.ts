"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  courseSchema,
  createCourseSchema,
  replaceTopicsSchema,
} from "@gurukulam/contracts";

import { apiFetch, checkShape } from "@/server/api";
import { apiFormError, checked, clearable, fieldErrors, number, text } from "@/lib/action";
import { formError, type FormState } from "@/lib/form";
import { serialiseTopics } from "@/features/courses/topics";

/*
 * The edit schema, built from the create one rather than the contract's
 * `updateCourseSchema`: that is fully partial for the benefit of a one-field
 * PATCH, while this form posts everything, so a cleared name is a mistake to
 * report rather than an omission to ignore.
 */
const editCourseSchema = createCourseSchema
  .omit({ topics: true })
  .extend({ isActive: z.boolean() });

/**
 * A course holds topics, and a topic carries sessions. The topics are collected
 * here because they are the course's structure, not a detail of it — a course
 * with none cannot have a batch scheduled against it in any meaningful way.
 *
 * On edit they travel by their own endpoint, and only when they actually
 * changed. `PUT /courses/:id/topics` replaces the list wholesale: every topic
 * is soft-deleted and re-created, so an unchanged list submitted again would
 * re-issue every topic id and leave already-scheduled sessions pointing at
 * rows the course no longer lists. Sending it only on a real change keeps a
 * routine correction — a typo in the description — from doing that.
 */
export async function saveCourse(
  courseId: string | undefined,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const editing = courseId !== undefined;
  const optional = editing
    ? (key: string) => clearable(formData, key)
    : (key: string) => text(formData, key);

  const body = {
    name: text(formData, "name"),
    shortName: optional("shortName"),
    description: optional("description"),
    category: optional("category"),
    durationWeeks: number(formData, "durationWeeks"),
    durationHours: number(formData, "durationHours"),
    // Rupees as typed; the API parses to paise without touching a float.
    standardMarketValue: text(formData, "standardMarketValue"),
    syllabusUrl: text(formData, "syllabusUrl") ?? "",
    attendanceFloorPct: number(formData, "attendanceFloorPct"),
  };

  const topics = readTopics(formData);
  const parsedTopics = replaceTopicsSchema.safeParse({ topics });

  const parsed = editing
    ? editCourseSchema.safeParse({ ...body, isActive: checked(formData, "isActive") })
    : createCourseSchema.safeParse({ ...body, topics });

  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));
  if (editing && !parsedTopics.success) {
    return formError("Check the topics below.", fieldErrors(parsedTopics.error.issues));
  }

  try {
    checkShape(
      courseSchema,
      await apiFetch(editing ? `/courses/${courseId}` : "/courses", {
        method: editing ? "PATCH" : "POST",
        body: parsed.data,
      }),
      editing ? "PATCH /courses/:id" : "POST /courses",
    );

    if (editing && parsedTopics.success && topicsChanged(formData, topics)) {
      await apiFetch(`/courses/${courseId}/topics`, {
        method: "PUT",
        body: parsedTopics.data,
      });
    }
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath("/courses");
  redirect(editing ? `/courses?saved=1` : "/courses?created=1");
}

/** The topic rows as typed, in the order they appear. Blank titles are dropped. */
function readTopics(formData: FormData): { title: string; durationHours?: number }[] {
  const titles = formData.getAll("topicTitle").map(String);
  const hours = formData.getAll("topicHours").map(String);

  return titles
    .map((title, index) => ({
      title: title.trim(),
      ...(hours[index] === undefined || hours[index].trim() === ""
        ? {}
        : { durationHours: Number(hours[index]) }),
    }))
    .filter((topic) => topic.title !== "");
}

/**
 * Whether the topic list differs from the one the form was opened with.
 *
 * The snapshot rides along as a hidden field rather than being re-fetched: it
 * is the list this operator was actually looking at, so an edit made from a
 * stale page compares against what they saw.
 */
function topicsChanged(
  formData: FormData,
  topics: ReadonlyArray<{ title: string; durationHours?: number }>,
): boolean {
  const snapshot = formData.get("topicsSnapshot");
  if (typeof snapshot !== "string") return true;
  return snapshot !== serialiseTopics(topics);
}
