import { z } from "zod";
import { pageQuerySchema, queryBoolean } from "../common/page.js";

/**
 * A college is an ACTOR, not a directory row: it has users, contracts,
 * requirements and its own students. It is also the college-scope axis — a
 * college portal user sees exactly one of these.
 */
export const collegePocSchema = z.object({
  pocId: z.string(),
  collegeId: z.string(),
  name: z.string(),
  designation: z.string().nullable(),
  department: z.string().nullable(),
  email: z.string(),
  phone: z.string().nullable(),
  isPrimary: z.boolean(),
});

export const collegeSchema = z.object({
  collegeId: z.string(),
  collegeCode: z.string(),
  name: z.string(),
  shortName: z.string().nullable(),
  countryId: z.string(),
  cityId: z.string(),
  cityName: z.string().nullable().optional(),
  addressLine1: z.string().nullable(),
  addressLine2: z.string().nullable(),
  postalCode: z.string().nullable(),
  website: z.string().nullable(),
  affiliation: z.string().nullable(),
  disciplines: z.array(z.string()),
  /** Read back so the edit form can round-trip it — a write-only field is one
      an operator would silently erase every time they corrected an address. */
  notes: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
  pocCount: z.number().int().optional(),
  studentCount: z.number().int().optional(),
  batchCount: z.number().int().optional(),
  openRequirementCount: z.number().int().optional(),
});

export type College = z.infer<typeof collegeSchema>;
export type CollegePoc = z.infer<typeof collegePocSchema>;

/**
 * What `GET /colleges/:id` returns: the college with its points of contact.
 *
 * Exactly one contact is primary — a college is an actor we deal with through
 * people, not a directory row, so the contacts travel with the record.
 */
export const collegeDetailSchema = collegeSchema.extend({
  pocs: z.array(collegePocSchema),
});

export type CollegeDetail = z.infer<typeof collegeDetailSchema>;

export const collegeQuerySchema = pageQuerySchema.extend({
  cityId: z.string().optional(),
  discipline: z.string().optional(),
  isActive: queryBoolean.optional(),
});

export type CollegeQuery = z.infer<typeof collegeQuerySchema>;

const pocInput = z.object({
  name: z.string().trim().min(1, "Enter the contact's name").max(160),
  designation: z.string().trim().max(120).optional(),
  department: z.string().trim().max(120).optional(),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  phone: z.string().trim().max(24).optional(),
  isPrimary: z.boolean().default(false),
});

export const createCollegeSchema = z.object({
  name: z.string().trim().min(1, "Enter the college name").max(200),
  shortName: z.string().trim().max(80).optional(),
  countryId: z.string().min(1, "Select a country"),
  cityId: z.string().min(1, "Select a city"),
  addressLine1: z.string().trim().max(255).optional(),
  addressLine2: z.string().trim().max(255).optional(),
  postalCode: z.string().trim().max(20).optional(),
  website: z.string().url("Enter a valid URL").optional().or(z.literal("")),
  affiliation: z.string().trim().max(200).optional(),
  disciplines: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
  notes: z.string().trim().max(4000).optional(),
  pocs: z.array(pocInput).max(50).default([]),
});

export type CreateCollegeInput = z.infer<typeof createCollegeSchema>;

export const updateCollegeSchema = createCollegeSchema
  .omit({ pocs: true })
  .partial()
  .extend({ isActive: z.boolean().optional() });

export type UpdateCollegeInput = z.infer<typeof updateCollegeSchema>;

export const replacePocsSchema = z.object({ pocs: z.array(pocInput).max(50) });
export type ReplacePocsInput = z.infer<typeof replacePocsSchema>;
