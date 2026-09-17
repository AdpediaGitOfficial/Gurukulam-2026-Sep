import { z } from "zod";
import { pageQuerySchema } from "../common/page.js";

/**
 * Outcomes.
 *
 * Two rules shape this whole module:
 *
 *   · Invariant 18 — certificates reach a college only through an APPROVED
 *     submission. An uploaded name is not a certificate. A college POC uploads
 *     names; an admin decides per row; only approved rows become certificates.
 *
 *   · Invariant 7 — eligibility is identical across segments; ACCESS is not.
 *     A retail student downloads their own certificate. A COLLEGE student does
 *     not — their institution downloads it for them.
 */

export const certificateStatusSchema = z.enum(["DRAFT", "ISSUED", "REVOKED"]);
export const submissionStatusSchema = z.enum([
  "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "RELEASED",
]);
export const rowStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED"]);

export const certificateSchema = z.object({
  certificateId: z.string(),
  /** GK-CERT-2026-00418. Never reused, deleted or not. */
  certificateNumber: z.string(),
  /** What the public verifier accepts — distinct from the number. */
  verificationCode: z.string(),
  studentId: z.string(),
  studentCode: z.string().nullable().optional(),
  studentName: z.string().nullable().optional(),
  courseId: z.string(),
  courseName: z.string().nullable().optional(),
  batchId: z.string(),
  batchCode: z.string().nullable().optional(),
  segment: z.enum(["RETAIL", "COLLEGE"]).optional(),
  submissionRowId: z.string().nullable(),
  status: certificateStatusSchema,
  issuedDate: z.string().nullable(),
  pdfUrl: z.string().nullable(),
  revokedAt: z.string().nullable(),
  revokedReason: z.string().nullable(),
  createdAt: z.string(),
});

export type Certificate = z.infer<typeof certificateSchema>;

export const certificateQuerySchema = pageQuerySchema.extend({
  studentId: z.string().optional(),
  batchId: z.string().optional(),
  courseId: z.string().optional(),
  collegeId: z.string().optional(),
  status: certificateStatusSchema.optional(),
  segment: z.enum(["RETAIL", "COLLEGE"]).optional(),
});

export type CertificateQuery = z.infer<typeof certificateQuerySchema>;

/**
 * What the review table shows so eligibility is VISIBLE before an admin
 * decides — the point of the screen is that nobody approves blind.
 */
export const eligibilitySchema = z.object({
  studentId: z.string(),
  batchId: z.string(),
  sessionsCompleted: z.number().int(),
  sessionsAttended: z.number().int(),
  /** Null when no attendance has been recorded for the batch at all. */
  attendancePct: z.number().nullable(),
  attendanceFloorPct: z.number().int().nullable(),
  /**
   * Attendance is deferred by request, so a batch may have no rows at all.
   * NOT_EVALUATED says so honestly rather than reporting 0% and blocking
   * every certificate.
   */
  attendanceCheck: z.enum(["MET", "BELOW_FLOOR", "NOT_EVALUATED"]),
  assignmentsTotal: z.number().int(),
  assignmentsSubmitted: z.number().int(),
  onRoster: z.boolean(),
  batchCompleted: z.boolean(),
  /** Whether an admin may sign this off — never an automatic issue. */
  eligible: z.boolean(),
  blockers: z.array(z.string()),
});

export type Eligibility = z.infer<typeof eligibilitySchema>;

/** An admin issuing directly — the retail path, and the override for any. */
export const issueCertificateSchema = z.object({
  studentId: z.string().min(1, "Select a student"),
  batchId: z.string().min(1, "Select a batch"),
  /**
   * Course completion is admin sign-off with an attendance floor. Setting this
   * records that the operator saw the blockers and decided anyway.
   */
  overrideBlockers: z.boolean().default(false),
  overrideReason: z.string().trim().max(500).optional(),
});

export type IssueCertificateInput = z.infer<typeof issueCertificateSchema>;

export const revokeCertificateSchema = z.object({
  reason: z.string().trim().min(1, "Say why it is being revoked").max(500),
});

export type RevokeCertificateInput = z.infer<typeof revokeCertificateSchema>;

// ── Submissions (invariant 18) ────────────────────────────────────────────

export const submissionRowSchema = z.object({
  rowId: z.string(),
  submissionId: z.string(),
  /** Kept verbatim even after matching — it is what the college actually sent. */
  uploadedName: z.string(),
  uploadedEmail: z.string().nullable(),
  uploadedRef: z.string().nullable(),
  studentId: z.string().nullable(),
  studentCode: z.string().nullable().optional(),
  status: rowStatusSchema,
  rejectionReason: z.string().nullable(),
  decidedAt: z.string().nullable(),
  eligibility: eligibilitySchema.nullable().optional(),
  certificateId: z.string().nullable().optional(),
});

export type SubmissionRow = z.infer<typeof submissionRowSchema>;

export const submissionSchema = z.object({
  submissionId: z.string(),
  collegeId: z.string(),
  collegeName: z.string().nullable().optional(),
  batchId: z.string(),
  batchCode: z.string().nullable().optional(),
  status: submissionStatusSchema,
  submittedAt: z.string(),
  reviewedAt: z.string().nullable(),
  releasedAt: z.string().nullable(),
  rowCount: z.number().int().optional(),
  approvedCount: z.number().int().optional(),
  rejectedCount: z.number().int().optional(),
  pendingCount: z.number().int().optional(),
  rows: z.array(submissionRowSchema).optional(),
});

export type Submission = z.infer<typeof submissionSchema>;

export const submissionQuerySchema = pageQuerySchema.extend({
  collegeId: z.string().optional(),
  batchId: z.string().optional(),
  status: submissionStatusSchema.optional(),
});

export type SubmissionQuery = z.infer<typeof submissionQuerySchema>;

export const createSubmissionSchema = z.object({
  batchId: z.string().min(1, "Select the training this is for"),
  names: z
    .array(
      z.object({
        name: z.string().trim().min(1, "A name is required").max(200),
        email: z.string().trim().toLowerCase().email("Enter a valid email address").optional().or(z.literal("")),
        ref: z.string().trim().max(80).optional(),
      }),
    )
    .min(1, "Upload at least one name")
    .max(1000),
});

export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>;

/** An admin's decision on one uploaded name. */
export const decideRowSchema = z
  .object({
    decision: z.enum(["APPROVE", "REJECT"]),
    /** Required to approve: an uploaded name must be matched to a record. */
    studentId: z.string().optional(),
    reason: z.string().trim().max(500).optional(),
    overrideBlockers: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.decision === "APPROVE" && !v.studentId) {
      ctx.addIssue({
        code: "custom",
        path: ["studentId"],
        message: "Match the uploaded name to a student before approving it",
      });
    }
    if (v.decision === "REJECT" && !v.reason) {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Say why, so the college can correct the list",
      });
    }
  });

export type DecideRowInput = z.infer<typeof decideRowSchema>;

/** What the public verifier returns. Deliberately minimal. */
export const verificationSchema = z.object({
  valid: z.boolean(),
  certificateNumber: z.string().nullable(),
  studentName: z.string().nullable(),
  courseName: z.string().nullable(),
  issuedDate: z.string().nullable(),
  status: certificateStatusSchema.nullable(),
  revokedAt: z.string().nullable(),
});

export type Verification = z.infer<typeof verificationSchema>;
