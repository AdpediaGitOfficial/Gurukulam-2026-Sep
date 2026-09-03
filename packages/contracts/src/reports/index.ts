import { z } from "zod";
import { moneyMinor } from "../common/money.js";

/**
 * Reports.
 *
 *     REPORT = MEASURES × DIMENSIONS × FILTERS → table | chart | export
 *
 * Designed as a system rather than a menu, so the four built here share one
 * request shape and one envelope; the remaining catalogue entries slot into
 * the same grammar rather than each inventing their own.
 *
 * A report is the easiest place to leak another region's or college's data,
 * because it feels like "just numbers" — there is no record on screen that
 * looks wrong. Scope is applied server-side to every measure, and the scope
 * the figures were computed under is echoed back.
 */

export const reportFormatSchema = z.enum(["json", "csv"]);

/** Every report takes the same window, and can compare against the previous one. */
export const reportQuerySchema = z.object({
  from: z.string().min(1, "Choose a start date"),
  to: z.string().min(1, "Choose an end date"),
  /** Compare against the immediately preceding window of equal length. */
  compare: z.coerce.boolean().default(false),
  format: reportFormatSchema.default("json"),
  cityId: z.string().optional(),
  collegeId: z.string().optional(),
  courseId: z.string().optional(),
  batchId: z.string().optional(),
  segment: z.enum(["RETAIL", "COLLEGE"]).optional(),
});

export type ReportQuery = z.infer<typeof reportQuerySchema>;

export const reportScopeSchema = z.object({
  cityIds: z.array(z.string()).nullable(),
  collegeId: z.string().nullable(),
  label: z.string(),
});

/** The envelope every report returns, so one client renders all of them. */
export const reportMetaSchema = z.object({
  reportKey: z.string(),
  title: z.string(),
  from: z.string(),
  to: z.string(),
  comparedFrom: z.string().nullable(),
  comparedTo: z.string().nullable(),
  scope: reportScopeSchema,
  generatedAt: z.string(),
  rowCount: z.number().int(),
});

export type ReportMeta = z.infer<typeof reportMetaSchema>;

/** A headline figure, optionally against the comparison window. */
export const measureSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.string(),
  /** "money" renders as paise; "count" and "percent" as numbers. */
  unit: z.enum(["money", "count", "percent", "days"]),
  previous: z.string().nullable(),
  /** Signed change against the previous window, in the same unit. */
  delta: z.string().nullable(),
});

export type Measure = z.infer<typeof measureSchema>;

// ── The library ───────────────────────────────────────────────────────────

export const reportCatalogueEntrySchema = z.object({
  key: z.string(),
  title: z.string(),
  description: z.string(),
  group: z.enum(["Money", "Enrolment", "Delivery", "Outcomes", "Placement"]),
  measures: z.array(z.string()),
  dimensions: z.array(z.string()),
  /** Whether this one is implemented, or catalogued for later. */
  status: z.enum(["BUILT", "SPECIFIED"]),
  path: z.string().nullable(),
});

export type ReportCatalogueEntry = z.infer<typeof reportCatalogueEntrySchema>;

// ── Outstanding & ageing ──────────────────────────────────────────────────

export const outstandingRowSchema = z.object({
  parentType: z.enum(["STUDENT", "COLLEGE"]),
  parentId: z.string(),
  parentName: z.string(),
  reference: z.string(),
  courseName: z.string().nullable(),
  totalMinor: moneyMinor,
  paidMinor: moneyMinor,
  outstandingMinor: moneyMinor,
  /** Days past due on the OLDEST unpaid installment. */
  oldestOverdueDays: z.number().int(),
  bucket: z.enum(["CURRENT", "D1_30", "D31_60", "D61_90", "D90_PLUS"]),
  nextDueDate: z.string().nullable(),
});

export type OutstandingRow = z.infer<typeof outstandingRowSchema>;

// ── Collection register ───────────────────────────────────────────────────

export const collectionRowSchema = z.object({
  transactionCode: z.string(),
  paidAt: z.string(),
  parentType: z.enum(["STUDENT", "COLLEGE"]),
  parentName: z.string(),
  reference: z.string(),
  amountMinor: moneyMinor,
  paymentMode: z.string(),
  externalTransactionId: z.string().nullable(),
  bankOrHandle: z.string().nullable(),
  isReversal: z.boolean(),
});

export type CollectionRow = z.infer<typeof collectionRowSchema>;

// ── Unallocated ageing ────────────────────────────────────────────────────

export const unallocatedRowSchema = z.object({
  studentId: z.string(),
  studentCode: z.string(),
  name: z.string(),
  email: z.string(),
  segment: z.enum(["RETAIL", "COLLEGE"]),
  collegeName: z.string().nullable(),
  cityName: z.string().nullable(),
  createdAt: z.string(),
  ageDays: z.number().int(),
  bucket: z.enum(["D0_3", "D4_7", "D8_14", "D15_PLUS"]),
  createdByType: z.string(),
});

export type UnallocatedRow = z.infer<typeof unallocatedRowSchema>;

// ── Batch progress ────────────────────────────────────────────────────────

export const batchProgressRowSchema = z.object({
  batchId: z.string(),
  batchCode: z.string(),
  name: z.string(),
  segment: z.enum(["RETAIL", "COLLEGE"]),
  collegeName: z.string().nullable(),
  courseName: z.string().nullable(),
  trainerName: z.string().nullable(),
  status: z.string(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  enrolled: z.number().int(),
  capacity: z.number().int().nullable(),
  sessionsTotal: z.number().int(),
  sessionsCompleted: z.number().int(),
  /** Completed ÷ total, as a whole percentage. */
  progressPct: z.number().int(),
  recordingsMissing: z.number().int(),
  certificatesIssued: z.number().int(),
});

export type BatchProgressRow = z.infer<typeof batchProgressRowSchema>;

export function reportSchema<T extends z.ZodTypeAny>(row: T) {
  return z.object({
    meta: reportMetaSchema,
    measures: z.array(measureSchema),
    rows: z.array(row),
  });
}

export interface Report<TRow> {
  meta: ReportMeta;
  measures: Measure[];
  rows: TRow[];
}
