import { z } from "zod";
import { pageQuerySchema, queryBoolean } from "../common/page.js";
import { moneyMinor } from "../common/money.js";
import { paymentModeSchema } from "../ledger/index.js";

/**
 * Retail and college students in one register.
 *
 * `collegeId` is nullable and always will be — a retail walk-in has no college
 * and never will (invariant 1). The segment is carried explicitly in
 * `enrolmentChannel` rather than inferred from that null, because an admin may
 * attach a retail student to a college later and acquisition channel is a
 * reporting dimension in its own right.
 */
export const studentSchema = z.object({
  studentId: z.string(),
  studentCode: z.string(),
  firstName: z.string(),
  lastName: z.string().nullable(),
  email: z.string(),
  phone: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  gender: z.string().nullable(),
  collegeId: z.string().nullable(),
  collegeName: z.string().nullable().optional(),
  enrolmentChannel: z.enum(["RETAIL", "COLLEGE"]),
  countryId: z.string().nullable(),
  cityId: z.string().nullable(),
  cityName: z.string().nullable().optional(),
  discipline: z.string().nullable(),
  passoutYear: z.number().int().nullable(),
  qualification: z.string().nullable(),
  accountStatus: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
  suspendedReason: z.string().nullable(),
  credentialsIssuedAt: z.string().nullable(),
  lastLoginAt: z.string().nullable(),
  /** Who onboarded them — a college user for institutional intake. */
  createdBy: z.string().nullable(),
  createdByType: z.enum(["ADMIN_USER", "COLLEGE_USER", "TRAINER", "STUDENT", "API_CLIENT", "SYSTEM"]),
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
  batchCount: z.number().int().optional(),
  /** True once the student sits on at least one live roster. */
  isAllocated: z.boolean().optional(),
});

export type Student = z.infer<typeof studentSchema>;

/**
 * One batch this student sits on, as the detail endpoint returns it.
 *
 * Enough to name the enrolment without a second request, and no more — the
 * batch's own record is a link away.
 */
export const studentBatchSchema = z.object({
  batchId: z.string(),
  batchCode: z.string(),
  name: z.string(),
  status: z.string(),
  segment: z.enum(["RETAIL", "COLLEGE"]),
  courseId: z.string(),
  courseName: z.string().nullable(),
  enrolledAt: z.string(),
  completedAt: z.string().nullable(),
});

export type StudentBatch = z.infer<typeof studentBatchSchema>;

/**
 * One fee ledger. RETAIL ONLY, always — a college student is billed through
 * their institution's contract and has no individual ledger (invariant 3), so
 * this array is empty for them rather than absent.
 */
export const studentLedgerSchema = z.object({
  ledgerId: z.string(),
  courseId: z.string(),
  courseValueMinor: moneyMinor,
  enrolmentValueMinor: moneyMinor,
  discountAmountMinor: moneyMinor.nullable(),
  totalPaidMinor: moneyMinor,
  balancePendingMinor: moneyMinor,
  status: z.string(),
  installmentCount: z.number().int(),
});

export type StudentLedger = z.infer<typeof studentLedgerSchema>;

/**
 * What `GET /students/:id` returns: the record plus the two things you always
 * want beside it — where they are enrolled, and what they owe.
 *
 * Declared here rather than left implied. An undocumented field is invisible
 * to the OpenAPI document, which means the mobile and third-party clients
 * cannot see it at all.
 */
export const studentDetailSchema = studentSchema.extend({
  batches: z.array(studentBatchSchema),
  ledgers: z.array(studentLedgerSchema),
});

export type StudentDetail = z.infer<typeof studentDetailSchema>;

export const studentQuerySchema = pageQuerySchema.extend({
  collegeId: z.string().optional(),
  cityId: z.string().optional(),
  batchId: z.string().optional(),
  courseId: z.string().optional(),
  segment: z.enum(["RETAIL", "COLLEGE"]).optional(),
  accountStatus: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional(),
  /** The unallocated queue: students with no live batch mapping. */
  allocated: queryBoolean.optional(),
});

export type StudentQuery = z.infer<typeof studentQuerySchema>;

/**
 * Onboarding creates the RECORD ONLY. Course, batch, price, schedule and
 * credentials are all decided at allocation — which is why this input carries
 * none of them.
 */
export const createStudentSchema = z.object({
  firstName: z.string().trim().min(1, "Enter the student's first name").max(120),
  lastName: z.string().trim().max(120).optional(),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  phone: z.string().trim().max(24).optional(),
  altPhone: z.string().trim().max(24).optional(),
  dateOfBirth: z.string().optional(),
  gender: z.string().trim().max(24).optional(),
  /** Omit for a retail walk-in. Setting it makes this institutional intake. */
  collegeId: z.string().optional(),
  countryId: z.string().optional(),
  cityId: z.string().optional(),
  addressLine1: z.string().trim().max(255).optional(),
  addressLine2: z.string().trim().max(255).optional(),
  postalCode: z.string().trim().max(20).optional(),
  discipline: z.string().trim().max(120).optional(),
  passoutYear: z.number().int().min(1950).max(2100).optional(),
  qualification: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(4000).optional(),
});

export type CreateStudentInput = z.infer<typeof createStudentSchema>;

export const updateStudentSchema = createStudentSchema.partial().omit({ collegeId: true });
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;

export const suspendStudentSchema = z.object({
  reason: z.string().trim().min(1, "Say why the account is being suspended").max(500),
});
export type SuspendStudentInput = z.infer<typeof suspendStudentSchema>;

// ── Allocation ────────────────────────────────────────────────────────────

const advanceSchema = z.object({
  amount: z.string().min(1, "Enter the advance amount"),
  mode: paymentModeSchema,
  /** Required for every mode except cash — enforced against the mode below. */
  transactionId: z.string().trim().max(120).optional(),
  paidAt: z.string().min(1, "When was it paid?"),
  bankOrHandle: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(400).optional(),
});

const installmentSchema = z.object({
  amount: z.string().min(1, "Enter the installment amount"),
  dueDate: z.string().min(1, "Choose a due date"),
});

/**
 * The five-step allocation, submitted as one payload and applied as one
 * transaction (invariant 12): batch mapping, session access, ledger,
 * installments and credentials — all of it, or none.
 *
 * The pricing fields are RETAIL ONLY. A college student is billed through
 * their institution's contract and has no individual ledger (invariant 3);
 * the service refuses pricing on a college allocation rather than silently
 * ignoring it.
 */
export const allocateStudentSchema = z
  .object({
    batchId: z.string().min(1, "Select a batch"),
    /** The pitched price actually agreed, in rupees as typed. Retail only. */
    enrolmentValue: z.string().optional(),
    advance: advanceSchema.optional(),
    /**
     * The hand-authored schedule — one row to a hundred. Retail only, and it
     * must account for the whole enrolment value.
     */
    installments: z.array(installmentSchema).max(100).default([]),
    /** Issues a password and emails the welcome pack. */
    issueCredentials: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.advance && v.advance.mode !== "CASH" && !v.advance.transactionId) {
      ctx.addIssue({
        code: "custom",
        path: ["advance", "transactionId"],
        message: "A transaction ID is required for every mode except cash",
      });
    }
  });

export type AllocateStudentInput = z.infer<typeof allocateStudentSchema>;

export const allocationResultSchema = z.object({
  studentId: z.string(),
  studentCode: z.string(),
  batchId: z.string(),
  batchCode: z.string(),
  segment: z.enum(["RETAIL", "COLLEGE"]),
  /** Null for a college student — they are billed through the institution. */
  ledgerId: z.string().nullable(),
  installmentCount: z.number().int(),
  enrolmentValueMinor: moneyMinor.nullable(),
  balancePendingMinor: moneyMinor.nullable(),
  credentialsIssued: z.boolean(),
  sessionsGranted: z.number().int(),
});

export type AllocationResult = z.infer<typeof allocationResultSchema>;

/**
 * The unallocated queue and its three sibling data-hygiene queues — the gap
 * between a record existing and revenue actually starting.
 */
export const unallocatedSummarySchema = z.object({
  unallocated: z.object({
    total: z.number().int(),
    /** Ageing buckets, in days since the record was created. */
    buckets: z.object({
      d0to3: z.number().int(),
      d4to7: z.number().int(),
      d8to14: z.number().int(),
      d15plus: z.number().int(),
    }),
  }),
  /** Retail students on a roster with no fee ledger — billing never started. */
  noLedger: z.number().int(),
  /** A ledger with no schedule — nothing will ever fall due. */
  noInstallments: z.number().int(),
  /** Credentials issued and never used. */
  credentialsUnused: z.number().int(),
});

export type UnallocatedSummary = z.infer<typeof unallocatedSummarySchema>;
