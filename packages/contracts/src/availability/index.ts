import { z } from "zod";

/**
 * Declared leave and blocked time.
 *
 * One half of invariant 8: free/busy is COMPUTED from committed sessions plus
 * this, never stored. The batch service already reads it when checking a
 * trainer proposal for clashes — until now nothing could write it, so half
 * the check was inert.
 */
export const availabilityTypeSchema = z.enum(["LEAVE", "BLOCKED"]);

export const availabilitySchema = z.object({
  availabilityId: z.string(),
  trainerId: z.string(),
  trainerName: z.string().nullable().optional(),
  type: availabilityTypeSchema,
  startsAt: z.string(),
  endsAt: z.string(),
  isFullDay: z.boolean(),
  reason: z.string().nullable(),
  createdAt: z.string(),
});

export type Availability = z.infer<typeof availabilitySchema>;

export const declareAvailabilitySchema = z
  .object({
    type: availabilityTypeSchema.default("LEAVE"),
    startsAt: z.string().min(1, "When does it start?"),
    endsAt: z.string().min(1, "When does it end?"),
    isFullDay: z.boolean().default(true),
    reason: z.string().trim().max(400).optional(),
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), {
    message: "It must end after it starts",
    path: ["endsAt"],
  });

export type DeclareAvailabilityInput = z.infer<typeof declareAvailabilitySchema>;

/**
 * The availability calendar is the ASSIGNMENT SURFACE, not a report — an
 * admin picks a trainer from it. So each entry answers the question actually
 * being asked: can this person take this batch?
 */
export const calendarEntrySchema = z.object({
  trainerId: z.string(),
  trainerCode: z.string(),
  name: z.string(),
  cityId: z.string().nullable(),
  /** Committed sessions in the window — the other half of free/busy. */
  committedSessions: z.number().int(),
  /** Declared leave or blocked time overlapping the window. */
  declaredAway: z.number().int(),
  /** Hours already committed in the window, against max_weekly_hours. */
  committedHours: z.number(),
  maxWeeklyHours: z.number().int().nullable(),
  /**
   * Committed beyond `max_weekly_hours` across the window.
   *
   * Reported rather than left to be inferred: a trainer with no sessions and
   * no leave who is still not free would otherwise be unexplainable, and
   * re-deriving it on the client means duplicating the window arithmetic that
   * decides it here.
   */
  overCommitted: z.boolean(),
  /** True when nothing in the window conflicts. Computed, never stored. */
  free: z.boolean(),
  /** Present only when this call named a course (invariant 15). */
  approvedForCourse: z.boolean().nullable(),
  /**
   * The window, a day at a time — the grid an admin actually assigns from.
   *
   * Same rows the totals above are computed from, grouped by date, so it costs
   * no extra query. Capped: past a month the grid stops being readable and the
   * totals are the useful answer, so a longer window returns an empty array
   * rather than a payload nobody renders.
   */
  days: z.array(
    z.object({
      date: z.string(),
      sessions: z.number().int(),
      away: z.boolean(),
    }),
  ),
});

/** Days past which the per-day breakdown is omitted. */
export const CALENDAR_GRID_DAYS = 31;

export type CalendarEntry = z.infer<typeof calendarEntrySchema>;

export const calendarQuerySchema = z.object({
  from: z.string().min(1, "Choose a window start"),
  to: z.string().min(1, "Choose a window end"),
  cityId: z.string().optional(),
  /** Narrows to trainers approved for this course — the picker's real question. */
  courseId: z.string().optional(),
  /** Only those with nothing conflicting in the window. */
  freeOnly: z.coerce.boolean().optional(),
});

export type CalendarQuery = z.infer<typeof calendarQuerySchema>;
