import "server-only";
import { questionSchema, type Page, type Question } from "@gurukulam/contracts";
import { apiFetch } from "@/server/api";
import { fetchPage, PAGE_KEYS, type SearchParams } from "@/server/list";

export const QUESTION_FILTERS = [
  ...PAGE_KEYS, "courseId", "topicId", "questionType", "difficulty",
] as const;

/** Assessment belongs to a course, which is why the bank lives under Courses. */
export async function listQuestions(params: SearchParams): Promise<Page<Question>> {
  return fetchPage("/courses/question-bank", questionSchema, params, QUESTION_FILTERS);
}

export async function getQuestion(questionId: string): Promise<Question> {
  return questionSchema.parse(await apiFetch(`/courses/question-bank/${questionId}`));
}
