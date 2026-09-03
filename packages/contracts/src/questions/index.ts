import { z } from "zod";
import { pageQuerySchema } from "../common/page.js";

export const questionTypeSchema = z.enum([
  "MCQ_SINGLE", "MCQ_MULTI", "TRUE_FALSE", "SHORT_ANSWER", "DESCRIPTIVE",
]);
export const difficultySchema = z.enum(["EASY", "MEDIUM", "HARD"]);

export const questionOptionSchema = z.object({
  key: z.string().min(1).max(4),
  text: z.string().min(1).max(1000),
});

export const questionSchema = z.object({
  questionId: z.string(),
  courseId: z.string(),
  courseName: z.string().nullable().optional(),
  topicId: z.string().nullable(),
  topicTitle: z.string().nullable().optional(),
  questionType: questionTypeSchema,
  difficulty: difficultySchema,
  questionText: z.string(),
  options: z.array(questionOptionSchema).nullable(),
  correctAnswers: z.array(z.string()).nullable(),
  explanation: z.string().nullable(),
  marks: z.number().int(),
  tags: z.array(z.string()),
  isActive: z.boolean(),
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
});

export type Question = z.infer<typeof questionSchema>;

export const questionQuerySchema = pageQuerySchema.extend({
  courseId: z.string().optional(),
  topicId: z.string().optional(),
  questionType: questionTypeSchema.optional(),
  difficulty: difficultySchema.optional(),
});

export type QuestionQuery = z.infer<typeof questionQuerySchema>;

/**
 * The shape rules differ by type, so validation is refined rather than flat:
 * a multiple-choice question without options is not a question, and one whose
 * answer key names an option that does not exist is worse — it marks every
 * attempt wrong and looks fine in the list.
 */
export const createQuestionSchema = z
  .object({
    courseId: z.string().min(1, "Select a course"),
    topicId: z.string().optional(),
    questionType: questionTypeSchema,
    difficulty: difficultySchema.default("MEDIUM"),
    questionText: z.string().trim().min(1, "Enter the question").max(4000),
    options: z.array(questionOptionSchema).max(10).optional(),
    correctAnswers: z.array(z.string()).max(10).optional(),
    explanation: z.string().trim().max(4000).optional(),
    marks: z.number().int().min(1).max(100).default(1),
    tags: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  })
  .superRefine((v, ctx) => {
    const needsOptions = v.questionType === "MCQ_SINGLE" || v.questionType === "MCQ_MULTI";

    if (needsOptions) {
      if (!v.options || v.options.length < 2) {
        ctx.addIssue({ code: "custom", path: ["options"], message: "Give at least two options" });
        return;
      }
      const keys = new Set(v.options.map((o) => o.key));
      if (keys.size !== v.options.length) {
        ctx.addIssue({ code: "custom", path: ["options"], message: "Option keys must be unique" });
      }
      if (!v.correctAnswers || v.correctAnswers.length === 0) {
        ctx.addIssue({ code: "custom", path: ["correctAnswers"], message: "Mark the correct answer" });
        return;
      }
      // The failure this catches is silent otherwise: every attempt is marked
      // wrong and the question looks perfectly fine in the list.
      const unknown = v.correctAnswers.filter((a) => !keys.has(a));
      if (unknown.length > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["correctAnswers"],
          message: `No such option: ${unknown.join(", ")}`,
        });
      }
      if (v.questionType === "MCQ_SINGLE" && v.correctAnswers.length !== 1) {
        ctx.addIssue({
          code: "custom",
          path: ["correctAnswers"],
          message: "A single-answer question has exactly one correct option",
        });
      }
    }

    if (v.questionType === "TRUE_FALSE") {
      const answer = v.correctAnswers?.[0]?.toUpperCase();
      if (v.correctAnswers?.length !== 1 || (answer !== "TRUE" && answer !== "FALSE")) {
        ctx.addIssue({
          code: "custom",
          path: ["correctAnswers"],
          message: "Answer must be exactly one of TRUE or FALSE",
        });
      }
    }
  });

export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

/** Same rules on update, so a valid question cannot be edited into an invalid one. */
export const updateQuestionSchema = createQuestionSchema;
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;
