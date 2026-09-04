import { z } from "zod";
import { pageQuerySchema } from "../common/page.js";
import { moneyMinor } from "../common/money.js";

/**
 * Approving a trainer for a course is a RELATIONSHIP, not a skill tag. Free
 * text cannot answer "who may run this batch?" without a string match, and a
 * batch's trainer must be approved for that batch's course (invariant 15).
 */
export const trainerSchema = z.object({
  trainerId: z.string(),
  trainerCode: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  qualification: z.string().nullable(),
  experienceYears: z.number().int().nullable(),
  skillTags: z.array(z.string()),
  payModel: z.string().nullable(),
  payRateMinor: moneyMinor.nullable(),
  maxWeeklyHours: z.number().int().nullable(),
  cityId: z.string().nullable(),
  cityName: z.string().nullable().optional(),
  accountStatus: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
  approvedCourseCount: z.number().int().optional(),
});

export type Trainer = z.infer<typeof trainerSchema>;

/**
 * One course this trainer is approved to take, and when that was granted.
 *
 * `approvedAt` is nullable: an approval carried over from an import or granted
 * before the column existed has no date, and claiming otherwise would make the
 * contract lie about rows that are already in the database.
 */
export const approvedCourseSchema = z.object({
  courseId: z.string(),
  courseCode: z.string(),
  name: z.string(),
  approvedAt: z.string().nullable(),
});

export type ApprovedCourse = z.infer<typeof approvedCourseSchema>;

/**
 * What `GET /trainers/:id` returns: the trainer with the courses they may take.
 *
 * That mapping is not decoration — it is what filters the trainer picker when
 * a batch is created, so a trainer can only be assigned to a course they are
 * approved for.
 */
export const trainerDetailSchema = trainerSchema.extend({
  approvedCourses: z.array(approvedCourseSchema),
});

export type TrainerDetail = z.infer<typeof trainerDetailSchema>;

export const trainerQuerySchema = pageQuerySchema.extend({
  cityId: z.string().optional(),
  /** Only trainers approved for this course — the batch trainer picker. */
  approvedForCourseId: z.string().optional(),
  accountStatus: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional(),
});

export type TrainerQuery = z.infer<typeof trainerQuerySchema>;

export const createTrainerSchema = z.object({
  name: z.string().trim().min(1, "Enter the trainer's name").max(160),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  phone: z.string().trim().max(24).optional(),
  qualification: z.string().trim().max(255).optional(),
  experienceYears: z.number().int().min(0).max(70).optional(),
  skillTags: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
  payModel: z.enum(["PER_SESSION", "PER_HOUR", "MONTHLY", "PER_BATCH"]).optional(),
  payRate: z.string().optional(),
  maxWeeklyHours: z.number().int().min(1).max(80).optional(),
  cityId: z.string().optional(),
});

export type CreateTrainerInput = z.infer<typeof createTrainerSchema>;

export const updateTrainerSchema = createTrainerSchema.partial().extend({
  accountStatus: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional(),
});

export type UpdateTrainerInput = z.infer<typeof updateTrainerSchema>;

export const approveCoursesSchema = z.object({
  /** The complete set of courses this trainer is approved for. */
  courseIds: z.array(z.string()).max(200),
});

export type ApproveCoursesInput = z.infer<typeof approveCoursesSchema>;
