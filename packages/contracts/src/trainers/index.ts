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
  /**
   * How we engage them, which decides whether an assignment needs their answer.
   *
   * A freelancer is proposed and may decline. An in-house trainer is staff:
   * allocating them is a management decision, so the assignment is confirmed as
   * it is made. Every other rule still applies to both.
   */
  engagement: z.enum(["IN_HOUSE", "FREELANCE"]),
  payModel: z.string().nullable(),
  payRateMinor: moneyMinor.nullable(),
  maxWeeklyHours: z.number().int().nullable(),
  cityId: z.string().nullable(),
  cityName: z.string().nullable().optional(),
  accountStatus: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
  /* Why delivery was withdrawn, and when. Both cleared on reinstatement — the
     same shape students and college portal accounts carry. */
  suspendedAt: z.string().nullable(),
  suspendedReason: z.string().nullable(),
  /**
   * Portal access, as two facts rather than a boolean.
   *
   * `loginEmail` is what an operator reads out when a trainer says they cannot
   * sign in — it is derived from the trainer code, not from their own address,
   * so it is never the one they expect. `credentialsIssuedAt` is when the act
   * happened; both null means the record exists and there is nothing to sign in
   * with, which is the ordinary state of a trainer on the bench.
   *
   * The password hash is NOT here and never will be. Mapping explicitly is what
   * keeps it that way.
   */
  loginEmail: z.string().nullable(),
  credentialsIssuedAt: z.string().nullable(),
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
  approvedCourseCount: z.number().int().optional(),
  /**
   * The courses this trainer may take, as ids.
   *
   * Carried on the list so a picker can narrow to a course chosen in the same
   * form — the alternative is offering everyone and letting the API refuse
   * after the form has been filled in.
   */
  approvedCourseIds: z.array(z.string()).optional(),
});

export type Trainer = z.infer<typeof trainerSchema>;

/**
 * What issuing access answers with.
 *
 * The temporary password is deliberately not in this shape. It goes in the
 * welcome pack; a secret that crossed the wire to a screen would be in a
 * browser history, a proxy log and a screenshot before the day was out.
 */
export const trainerAccessSchema = z.object({
  trainerId: z.string(),
  loginEmail: z.string().nullable(),
  issuedAt: z.string().nullable(),
});

export type TrainerAccess = z.infer<typeof trainerAccessSchema>;

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

/** The utilisation bands the dashboard draws, as a filter. */
export const trainerUtilisationSchema = z.enum(["BENCH", "LIGHT", "BUSY", "STRETCHED"]);

export type TrainerUtilisation = z.infer<typeof trainerUtilisationSchema>;

export const trainerAttentionSchema = z.enum([
  /** Two live sessions in the same slot on the same day. */
  "DOUBLE_BOOKED",
  /** Active, but approved to deliver nothing — capacity that cannot be used. */
  "NO_COURSES",
]);

export type TrainerAttention = z.infer<typeof trainerAttentionSchema>;

export const trainerQuerySchema = pageQuerySchema.extend({
  utilisation: trainerUtilisationSchema.optional(),
  attention: trainerAttentionSchema.optional(),
  cityId: z.string().optional(),
  engagement: z.enum(["IN_HOUSE", "FREELANCE"]).optional(),
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
  /* Defaulted rather than required: FREELANCE is what every trainer was before
     this field existed, and it is the safer of the two to assume — it asks
     rather than commits. */
  engagement: z.enum(["IN_HOUSE", "FREELANCE"]).default("FREELANCE"),
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

/**
 * Suspending a trainer.
 *
 * The reason is REQUIRED, as it is for a student: an account that stopped
 * working with no explanation is the thing whoever finds it has to go and ask
 * about. Suspension withdraws them from being proposed for new batches; it
 * does not touch the batches they are already confirmed on.
 */
export const suspendTrainerSchema = z.object({
  reason: z.string().trim().min(1, "Say why this trainer is being suspended").max(500),
});

export type SuspendTrainerInput = z.infer<typeof suspendTrainerSchema>;

export const approveCoursesSchema = z.object({
  /** The complete set of courses this trainer is approved for. */
  courseIds: z.array(z.string()).max(200),
});

export type ApproveCoursesInput = z.infer<typeof approveCoursesSchema>;
