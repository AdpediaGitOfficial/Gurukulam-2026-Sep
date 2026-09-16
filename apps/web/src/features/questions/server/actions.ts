"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createQuestionSchema, questionSchema } from "@gurukulam/contracts";

import { apiFetch, checkShape } from "@/server/api";
import { apiFormError, fieldErrors, number, text } from "@/lib/action";
import { formError, type FormState } from "@/lib/form";

/**
 * A question, as the form posts it.
 *
 * Options arrive as parallel `option-key` / `option-text` fields — one pair
 * per row the operator added — and the correct answers as checkboxes named by
 * key. Pairing them here rather than in the component keeps the contract's
 * rules the only place either shape is validated.
 *
 * The rule worth naming: a correct answer that is not one of the options is
 * silently catastrophic. Every attempt is marked wrong and the question looks
 * perfectly fine in the bank. The contract refuses it; this just makes sure
 * the pairing that feeds it is right.
 */
function readQuestion(formData: FormData): unknown {
  const keys = formData.getAll("optionKey").map((v) => v.toString().trim());
  const texts = formData.getAll("optionText").map((v) => v.toString().trim());

  const options = keys
    .map((key, index) => ({ key, text: texts[index] ?? "" }))
    // A blank row is one the operator added and did not fill in, not an
    // option with no text — dropping it is kinder than refusing the form.
    .filter((option) => option.key !== "" && option.text !== "");

  const type = text(formData, "questionType") ?? "MCQ_SINGLE";
  const correctAnswers =
    type === "TRUE_FALSE"
      ? [text(formData, "trueFalse") ?? ""].filter((v) => v !== "")
      : formData.getAll("correct").map((v) => v.toString());

  const tags = (text(formData, "tags") ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");

  return {
    courseId: text(formData, "courseId"),
    topicId: text(formData, "topicId"),
    questionType: type,
    difficulty: text(formData, "difficulty") ?? "MEDIUM",
    questionText: text(formData, "questionText"),
    ...(options.length === 0 ? {} : { options }),
    ...(correctAnswers.length === 0 ? {} : { correctAnswers }),
    explanation: text(formData, "explanation"),
    marks: number(formData, "marks") ?? 1,
    tags,
  };
}

export async function createQuestion(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = createQuestionSchema.safeParse(readQuestion(formData));
  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  try {
    const created = await apiFetch("/courses/question-bank", { method: "POST", body: parsed.data });
    checkShape(questionSchema, created, "POST /courses/question-bank");
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath("/courses/question-bank");
  redirect("/courses/question-bank?created=1");
}

/**
 * Correcting a question.
 *
 * `updateQuestionSchema` IS `createQuestionSchema` — an update posts the whole
 * question, options and answers included, because a partial update of a set of
 * options is not a thing that can be expressed coherently. The form therefore
 * carries every field, filled in.
 */
export async function updateQuestion(
  questionId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = createQuestionSchema.safeParse(readQuestion(formData));
  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  try {
    const saved = await apiFetch(`/courses/question-bank/${questionId}`, {
      method: "PATCH",
      body: parsed.data,
    });
    checkShape(questionSchema, saved, "PATCH /courses/question-bank/:id");
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath("/courses/question-bank");
  redirect("/courses/question-bank?saved=1");
}
