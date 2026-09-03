import { z } from "zod";
import { pageQuerySchema } from "../common/page.js";
import { moneyMinor } from "../common/money.js";

/**
 * A course holds topics; a topic carries one or more sessions. The course is
 * the top of the delivery chain — Course › Topic › Batch › Session.
 */
export const courseTopicSchema = z.object({
  topicId: z.string(),
  courseId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  sequence: z.number().int(),
  durationHours: z.number().int().nullable(),
});

export const courseSchema = z.object({
  courseId: z.string(),
  /** Generated on save, never typed, immutable once issued. */
  courseCode: z.string(),
  name: z.string(),
  shortName: z.string().nullable(),
  description: z.string().nullable(),
  category: z.string().nullable(),
  durationHours: z.number().int().nullable(),
  durationWeeks: z.number().int().nullable(),
  /** Auto-fills the fee ledger and every contract. Paise, as a string. */
  standardMarketValueMinor: moneyMinor,
  syllabusUrl: z.string().nullable(),
  attendanceFloorPct: z.number().int().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
  topicCount: z.number().int().optional(),
  batchCount: z.number().int().optional(),
  approvedTrainerCount: z.number().int().optional(),
});

export type Course = z.infer<typeof courseSchema>;
export type CourseTopic = z.infer<typeof courseTopicSchema>;

export const courseQuerySchema = pageQuerySchema.extend({
  category: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
});

export type CourseQuery = z.infer<typeof courseQuerySchema>;

const topicInput = z.object({
  title: z.string().trim().min(1, "Give the topic a title").max(200),
  description: z.string().trim().max(2000).optional(),
  durationHours: z.number().int().min(0).max(1000).optional(),
});

export const createCourseSchema = z.object({
  name: z.string().trim().min(1, "Give the course a name").max(200),
  shortName: z.string().trim().max(80).optional(),
  description: z.string().trim().max(4000).optional(),
  category: z.string().trim().max(120).optional(),
  durationHours: z.number().int().min(0).max(10_000).optional(),
  durationWeeks: z.number().int().min(0).max(520).optional(),
  /** Rupees as typed by an operator; parsed to paise server-side. */
  standardMarketValue: z.string().min(1, "Enter the standard market value"),
  syllabusUrl: z.string().url("Enter a valid URL").optional().or(z.literal("")),
  attendanceFloorPct: z.number().int().min(0).max(100).optional(),
  /** Topics are sequenced by their order in this array. */
  topics: z.array(topicInput).max(200).default([]),
});

export type CreateCourseInput = z.infer<typeof createCourseSchema>;

export const updateCourseSchema = createCourseSchema
  .omit({ topics: true })
  .partial()
  .extend({ isActive: z.boolean().optional() });

export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;

/** Topics are replaced wholesale — the console edits the list, not one row. */
export const replaceTopicsSchema = z.object({ topics: z.array(topicInput).max(200) });
export type ReplaceTopicsInput = z.infer<typeof replaceTopicsSchema>;
