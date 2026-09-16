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

/**
 * One month of history.
 *
 * `month` is `YYYY-MM` in UTC — a string rather than a Date because it is a
 * BUCKET, not an instant, and serialising an instant invites a reader to
 * subtract two of them.
 *
 * A payment's segment is resolved from its installment's PARENT — a retail
 * ledger or a college contract — never from a stored column, for the same
 * reason invariant 6 resolves a reminder's recipient that way. The parent is
 * the fact; anything copied alongside it is a second fact that can disagree.
 */
export const monthlyPointSchema = z.object({
  month: z.string(),
  /** What was actually received that month, by when it was received. */
  collected: segmentedMoneySchema,
  /** Students who joined a roster that month. */
  enrolments: segmentedCountSchema,
});

export type MonthlyPoint = z.infer<typeof monthlyPointSchema>;

/**
 * The time axis — the thing a dashboard of point-in-time counts cannot answer.
 *
 * "206 students" is a fact. "206 students, twelve more than last month" is the
 * beginning of a decision, and every figure above is the first kind until
 * something here gives it a direction.
 *
 * Twelve months, oldest first, INCLUDING months where nothing happened. A
 * series that silently drops its empty months draws a flat line through a
 * quarter where collections stopped, which is the one shape somebody needed
 * to see.
 */
export const trendSchema = z.object({
  months: z.array(monthlyPointSchema),
  /** This calendar month so far, against the whole of the last one. */
  collectedThisMonth: segmentedMoneySchema,
  collectedLastMonth: segmentedMoneySchema,
  enrolmentsThisMonth: segmentedCountSchema,
  enrolmentsLastMonth: segmentedCountSchema,
});

export type Trend = z.infer<typeof trendSchema>;

/**
 * A distribution — the whole population, bucketed.
 *
 * This is the shape a dashboard needs once the business is large. A ranked
 * list of ten describes ten things; at 1,217 courses it leaves 1,207
 * undescribed and invites the question "why those ten". A distribution
 * describes every row, in fixed space, at any size — and each bucket is a
 * filter somebody can open.
 *
 * Ordered arrays rather than a map, because the buckets are ORDERED: they are
 * drawn as one band left to right and a map has no order to draw.
 */
export const deliveryBucketSchema = z.enum([
  /** Live batches exist, but no session has been timetabled. */
  "NOT_SCHEDULED",
  /** Timetabled, nothing delivered yet. */
  "NOT_STARTED",
  /** Part-delivered. */
  "IN_FLIGHT",
  /** Every scheduled session delivered. */
  "COMPLETE",
]);

export type DeliveryBucket = z.infer<typeof deliveryBucketSchema>;

export const utilisationBucketSchema = z.enum([
  /** Active, carrying no live batch at all. */
  "BENCH",
  "LIGHT",
  "BUSY",
  /** At a load where one cancellation cascades. */
  "STRETCHED",
]);

export type UtilisationBucket = z.infer<typeof utilisationBucketSchema>;

export const deliverySliceSchema = z.object({
  bucket: deliveryBucketSchema,
  count: z.number().int(),
});

export const utilisationSliceSchema = z.object({
  bucket: utilisationBucketSchema,
  count: z.number().int(),
});

/**
 * The course portfolio, described rather than sampled.
 *
 * The queue counts are the OTHER half of the answer. A distribution says what
 * the shape is; a queue says which rows somebody has to do something about,
 * and it is bounded by the work rather than by an arbitrary cut-off.
 */
export const coursePortfolioSchema = z.object({
  totalCourses: z.number().int(),
  /** Courses with at least one live batch in scope. */
  withLiveDelivery: z.number().int(),
  delivery: z.array(deliverySliceSchema),
  /** Past their start date with not one session delivered. */
  stalledBatches: z.number().int(),
  /** A live batch and nobody on its roster. */
  coursesWithoutEnrolment: z.number().int(),
  /** More students mapped than the batch says it holds. */
  batchesOverCapacity: z.number().int(),
  /** No topics, so no schedule can be built from the course. */
  coursesWithoutTopics: z.number().int(),
});

export type CoursePortfolio = z.infer<typeof coursePortfolioSchema>;

/**
 * Trainer capacity.
 *
 * Utilisation rather than a leaderboard, because at 100+ trainers the question
 * is not who is best — nothing here measures that — it is who is idle and who
 * is overloaded. Both ends cost money, which is why the band has two bad ends
 * and a good middle rather than a single direction.
 */
export const trainerCapacitySchema = z.object({
  activeTrainers: z.number().int(),
  /** Carrying at least one live batch. */
  carryingDelivery: z.number().int(),
  utilisation: z.array(utilisationSliceSchema),
  /** Starting inside a fortnight with nobody confirmed. */
  unstaffedBatchesSoon: z.number().int(),
  /** Trainers with two live sessions in the same slot on the same day. */
  doubleBookedTrainers: z.number().int(),
  /** Proposed and unanswered for more than a week. */
  staleProposals: z.number().int(),
  /** Active, but approved to deliver nothing — capacity that cannot be used. */
  trainersWithoutCourses: z.number().int(),
});

export type TrainerCapacity = z.infer<typeof trainerCapacitySchema>;

export const dashboardSchema = z.object({
  headline: headlineSchema,
  actions: actionsSchema,
  collections: collectionsSchema,
  trend: trendSchema,
  delivery: deliverySchema,
  portfolio: coursePortfolioSchema,
  capacity: trainerCapacitySchema,
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
