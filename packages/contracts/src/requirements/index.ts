import { z } from "zod";
import { pageQuerySchema } from "../common/page.js";

/**
 * College requirements — the ENTRY POINT of the whole college engagement.
 *
 * An institution raises a requirement; an admin confirms it, and confirmation
 * creates the dedicated batch and keeps a link to it (invariant 14). Without
 * this module the college flow has to start with an admin inventing a batch,
 * which loses the record of what was actually asked for.
 */
export const requirementStatusSchema = z.enum([
  "NEW", "UNDER_REVIEW", "CONFIRMED", "REJECTED", "FULFILLED",
]);

export const requirementSchema = z.object({
  requirementId: z.string(),
  requirementCode: z.string(),
  collegeId: z.string(),
  collegeName: z.string().nullable().optional(),
  courseId: z.string(),
  courseName: z.string().nullable().optional(),
  expectedHeadcount: z.number().int(),
  preferredMode: z.enum(["ONLINE", "OFFLINE", "HYBRID"]),
  preferredWindowStart: z.string().nullable(),
  preferredWindowEnd: z.string().nullable(),
  discipline: z.string().nullable(),
  source: z.string().nullable(),
  notes: z.string().nullable(),
  status: requirementStatusSchema,
  rejectionReason: z.string().nullable(),
  confirmedAt: z.string().nullable(),
  /** The batch confirmation produced (invariant 14). */
  batchId: z.string().nullable(),
  batchCode: z.string().nullable().optional(),
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
});

export type Requirement = z.infer<typeof requirementSchema>;

export const requirementQuerySchema = pageQuerySchema.extend({
  collegeId: z.string().optional(),
  courseId: z.string().optional(),
  status: requirementStatusSchema.optional(),
});

export type RequirementQuery = z.infer<typeof requirementQuerySchema>;

export const createRequirementSchema = z
  .object({
    /** Omitted by a college user — they can only raise their own. */
    collegeId: z.string().optional(),
    courseId: z.string().min(1, "Select the course being asked for"),
    expectedHeadcount: z.number().int().min(1, "How many students?").max(10_000),
    preferredMode: z.enum(["ONLINE", "OFFLINE", "HYBRID"]).default("OFFLINE"),
    preferredWindowStart: z.string().optional(),
    preferredWindowEnd: z.string().optional(),
    discipline: z.string().trim().max(120).optional(),
    source: z.string().trim().max(80).optional(),
    notes: z.string().trim().max(4000).optional(),
  })
  .refine(
    (v) => !v.preferredWindowStart || !v.preferredWindowEnd || v.preferredWindowEnd >= v.preferredWindowStart,
    { message: "The window cannot end before it starts", path: ["preferredWindowEnd"] },
  );

export type CreateRequirementInput = z.infer<typeof createRequirementSchema>;

export const updateRequirementSchema = z.object({
  expectedHeadcount: z.number().int().min(1).max(10_000).optional(),
  preferredMode: z.enum(["ONLINE", "OFFLINE", "HYBRID"]).optional(),
  preferredWindowStart: z.string().optional(),
  preferredWindowEnd: z.string().optional(),
  discipline: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(4000).optional(),
  status: z.enum(["NEW", "UNDER_REVIEW"]).optional(),
});

export type UpdateRequirementInput = z.infer<typeof updateRequirementSchema>;

/**
 * Confirming a requirement CREATES its batch, in one transaction. The two are
 * one act: a confirmed requirement with no batch, or a batch nobody asked
 * for, are both states an operator would have to reconcile by hand.
 */
export const confirmRequirementSchema = z.object({
  batchName: z.string().trim().min(1, "Name the batch this creates").max(200),
  startDate: z.string().min(1, "Choose a start date"),
  endDate: z.string().optional(),
  mode: z.enum(["ONLINE", "OFFLINE", "HYBRID"]).optional(),
  venue: z.string().trim().max(255).optional(),
  meetingLink: z.string().url("Enter a valid URL").optional().or(z.literal("")),
  maxCapacity: z.number().int().min(1).max(1000).optional(),
});

export type ConfirmRequirementInput = z.infer<typeof confirmRequirementSchema>;

export const rejectRequirementSchema = z.object({
  reason: z.string().trim().min(1, "Say why, so the college can respond").max(500),
});

export type RejectRequirementInput = z.infer<typeof rejectRequirementSchema>;

// ── Portal access ─────────────────────────────────────────────────────────

export const portalAccessStatusSchema = z.enum(["NONE", "INVITED", "GRANTED", "REVOKED"]);

export const collegeUserSchema = z.object({
  collegeUserId: z.string(),
  collegeId: z.string(),
  collegeName: z.string().nullable().optional(),
  pocId: z.string().nullable(),
  name: z.string(),
  /** The contact address — where invoices and correspondence go. */
  email: z.string(),
  /** The portal login identity, derived from the college code. */
  loginEmail: z.string().nullable(),
  phone: z.string().nullable(),
  accessStatus: portalAccessStatusSchema,
  accountStatus: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
  grantedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  /** Why access was withdrawn. Cleared when access is granted again. */
  revokeReason: z.string().nullable(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
});

export type CollegeUser = z.infer<typeof collegeUserSchema>;

export const grantPortalAccessSchema = z.object({
  /** Grant against an existing contact, or supply the details directly. */
  pocId: z.string().optional(),
  name: z.string().trim().max(160).optional(),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").optional(),
  phone: z.string().trim().max(24).optional(),
});

export type GrantPortalAccessInput = z.infer<typeof grantPortalAccessSchema>;

export const revokePortalAccessSchema = z.object({
  /**
   * Why. Stored on the account and shown beside it — an operator looking at a
   * revoked login should not have to ask someone why it was revoked.
   */
  reason: z.string().trim().max(500).optional(),
});

export type RevokePortalAccessInput = z.infer<typeof revokePortalAccessSchema>;

/** What a grant returns once — the credential is never retrievable again. */
export const issuedCredentialSchema = z.object({
  collegeUserId: z.string(),
  loginEmail: z.string(),
  /** Shown ONCE. Only its hash is stored. */
  temporaryPassword: z.string(),
  mustResetPassword: z.literal(true),
});

export type IssuedCredential = z.infer<typeof issuedCredentialSchema>;
