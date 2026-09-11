import { z } from "zod";
import { pageQuerySchema } from "../common/page.js";
import { moneyMinor } from "../common/money.js";

/**
 * Job audience is evaluated at READ time, never materialised per student
 * (invariant 10). Materialising it means students enrolled later silently miss
 * postings, and batch transfers leave stale grants behind.
 *
 * Course is the primary targeting axis; everything else narrows it.
 */
export const jobAudienceRuleSchema = z.object({
  ruleId: z.string(),
  courseId: z.string(),
  courseName: z.string().nullable().optional(),
  batchId: z.string().nullable(),
  collegeId: z.string().nullable(),
  cityId: z.string().nullable(),
  passoutYear: z.number().int().nullable(),
  segment: z.enum(["RETAIL", "COLLEGE"]).nullable(),
  completedOnly: z.boolean(),
});

export const jobPostingSchema = z.object({
  jobPostingId: z.string(),
  jobCode: z.string(),
  roleTitle: z.string(),
  companyName: z.string(),
  location: z.string().nullable(),
  workMode: z.enum(["ONSITE", "REMOTE", "HYBRID"]),
  experienceMinYears: z.number().int().nullable(),
  experienceMaxYears: z.number().int().nullable(),
  compensationMinMinor: moneyMinor.nullable(),
  compensationMaxMinor: moneyMinor.nullable(),
  compensationPeriod: z.string().nullable(),
  skills: z.array(z.string()),
  description: z.string().nullable(),
  applyUrl: z.string().nullable(),
  applyEmail: z.string().nullable(),
  closingDate: z.string().nullable(),
  status: z.enum(["DRAFT", "PUBLISHED", "CLOSED", "ARCHIVED"]),
  publishedAt: z.string().nullable(),
  source: z.enum(["INTERNAL", "NAUKRI", "OTHER"]),
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
  audienceRules: z.array(jobAudienceRuleSchema).optional(),
  /** Live count of students this posting currently reaches. */
  reach: z.number().int().optional(),
});

export type JobPosting = z.infer<typeof jobPostingSchema>;
export type JobAudienceRule = z.infer<typeof jobAudienceRuleSchema>;

export const jobQuerySchema = pageQuerySchema.extend({
  status: z.enum(["DRAFT", "PUBLISHED", "CLOSED", "ARCHIVED"]).optional(),
  courseId: z.string().optional(),
});

export type JobQuery = z.infer<typeof jobQuerySchema>;

const audienceRuleInput = z.object({
  courseId: z.string().min(1, "Every audience rule starts from a course"),
  batchId: z.string().optional(),
  collegeId: z.string().optional(),
  cityId: z.string().optional(),
  passoutYear: z.number().int().min(1950).max(2100).optional(),
  segment: z.enum(["RETAIL", "COLLEGE"]).optional(),
  completedOnly: z.boolean().default(false),
});

export const createJobSchema = z
  .object({
    roleTitle: z.string().trim().min(1, "Enter the role title").max(200),
    companyName: z.string().trim().min(1, "Enter the company name").max(200),
    location: z.string().trim().max(200).optional(),
    workMode: z.enum(["ONSITE", "REMOTE", "HYBRID"]).default("ONSITE"),
    experienceMinYears: z.number().int().min(0).max(50).optional(),
    experienceMaxYears: z.number().int().min(0).max(50).optional(),
    compensationMin: z.string().optional(),
    compensationMax: z.string().optional(),
    compensationPeriod: z.enum(["ANNUAL", "MONTHLY"]).optional(),
    skills: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
    description: z.string().trim().max(8000).optional(),
    applyUrl: z.string().url("Enter a valid URL").optional().or(z.literal("")),
    applyEmail: z.string().email("Enter a valid email address").optional().or(z.literal("")),
    closingDate: z.string().optional(),
    audienceRules: z.array(audienceRuleInput).max(50).default([]),
  })
  .refine(
    (v) =>
      v.experienceMinYears === undefined ||
      v.experienceMaxYears === undefined ||
      v.experienceMaxYears >= v.experienceMinYears,
    { message: "Maximum experience cannot be below the minimum", path: ["experienceMaxYears"] },
  );

export type CreateJobInput = z.infer<typeof createJobSchema>;

export const updateJobSchema = z.object({
  roleTitle: z.string().trim().min(1).max(200).optional(),
  companyName: z.string().trim().min(1).max(200).optional(),
  location: z.string().trim().max(200).optional(),
  workMode: z.enum(["ONSITE", "REMOTE", "HYBRID"]).optional(),
  experienceMinYears: z.number().int().min(0).max(50).optional(),
  experienceMaxYears: z.number().int().min(0).max(50).optional(),
  compensationMin: z.string().optional(),
  compensationMax: z.string().optional(),
  compensationPeriod: z.enum(["ANNUAL", "MONTHLY"]).optional(),
  skills: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
  description: z.string().trim().max(8000).optional(),
  applyUrl: z.string().url().optional().or(z.literal("")),
  applyEmail: z.string().email().optional().or(z.literal("")),
  closingDate: z.string().optional(),
  audienceRules: z.array(audienceRuleInput).max(50).optional(),
});

export type UpdateJobInput = z.infer<typeof updateJobSchema>;
