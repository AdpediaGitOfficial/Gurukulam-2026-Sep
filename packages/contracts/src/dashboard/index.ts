import { z } from "zod";
import { moneyMinor } from "../common/money.js";

/**
 * The executive dashboard.
 *
 * Built last because it aggregates over everything else — computing these
 * figures earlier would mean computing them twice.
 *
 * **Segmented retail vs college throughout**, because the two have different
 * economics and a blended number hides both.
 *
 * Every figure here is scoped like any other query. A report is the easiest
 * place to leak another region's data precisely because it feels like "just
 * numbers", so the scope is applied to each aggregate rather than to a cached
 * total.
 */

/** A count split by segment. A blended total alone would hide both halves. */
export const segmentedCountSchema = z.object({
  total: z.number().int(),
  retail: z.number().int(),
  college: z.number().int(),
});

export type SegmentedCount = z.infer<typeof segmentedCountSchema>;

export const segmentedMoneySchema = z.object({
  total: moneyMinor,
  retail: moneyMinor,
  college: moneyMinor,
});

export type SegmentedMoney = z.infer<typeof segmentedMoneySchema>;

/** The four headline counts. */
export const headlineSchema = z.object({
  students: segmentedCountSchema,
  trainers: z.number().int(),
  colleges: z.number().int(),
  questionBank: z.number().int(),
});

/**
 * The four ACTION tiles, rendered in alert colours. Each is a queue that
 * should reach zero, not a statistic — which is what makes them actionable
 * rather than decorative.
 */
export const actionsSchema = z.object({
  unallocatedStudents: z.number().int(),
  overdueInstallments: z.number().int(),
  certificatesAwaitingApproval: z.number().int(),
  sessionsMissingRecordings: z.number().int(),
});

export const collectionsSchema = z.object({
  /** Billed: retail enrolment values plus college contract totals. */
  billed: segmentedMoneySchema,
  collected: segmentedMoneySchema,
  outstanding: segmentedMoneySchema,
  overdue: segmentedMoneySchema,
});

export const deliverySchema = z.object({
  activeBatches: segmentedCountSchema,
  sessionsThisWeek: z.number().int(),
  sessionsCompleted: z.number().int(),
  certificatesIssued: segmentedCountSchema,
});

export const coursePerformanceSchema = z.object({
  courseId: z.string(),
  courseCode: z.string(),
  name: z.string(),
  enrolled: segmentedCountSchema,
  activeBatches: z.number().int(),
  revenueMinor: moneyMinor,
});

export const trainerLoadSchema = z.object({
  trainerId: z.string(),
  trainerCode: z.string(),
  name: z.string(),
  confirmedBatches: z.number().int(),
  sessionsUpcoming: z.number().int(),
  approvedCourses: z.number().int(),
});

export const dashboardSchema = z.object({
  headline: headlineSchema,
  actions: actionsSchema,
  collections: collectionsSchema,
  delivery: deliverySchema,
  topCourses: z.array(coursePerformanceSchema),
  trainerLoad: z.array(trainerLoadSchema),
  /**
   * What the caller was allowed to see. Echoed back so a figure can never be
   * read as global when it was not — and so a cached response can be told
   * apart from another scope's.
   */
  scope: z.object({
    cityIds: z.array(z.string()).nullable(),
    collegeId: z.string().nullable(),
    label: z.string(),
  }),
  generatedAt: z.string(),
});

export type Dashboard = z.infer<typeof dashboardSchema>;
