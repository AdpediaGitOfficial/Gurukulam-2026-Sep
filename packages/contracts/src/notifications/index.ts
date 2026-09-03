import { z } from "zod";
import { pageQuerySchema } from "../common/page.js";

/**
 * Notifications.
 *
 * The bell is an ADMIN WORK QUEUE, not a news feed. If it cannot reach zero it
 * will be ignored within a fortnight, and that single constraint drives every
 * decision here:
 *
 *   · ACTION_REQUIRED persists until its condition CLEARS, and auto-resolves
 *     when it does — it is never dismissed by hand, because a dismissable
 *     queue is a queue nobody trusts.
 *   · Grouped by SITUATION, never by record: "9 students unallocated" is one
 *     row, not nine.
 *   · FYI auto-reads and never badges.
 *   · Scoped like any other query.
 */
export const notificationClassSchema = z.enum(["ACTION_REQUIRED", "ALERT", "FYI"]);
export const notificationStatusSchema = z.enum(["OPEN", "READ", "RESOLVED"]);

export const notificationSchema = z.object({
  notificationId: z.string(),
  /** A key from the catalogue, e.g. "students.unallocated". */
  type: z.string(),
  class: notificationClassSchema,
  title: z.string(),
  body: z.string().nullable(),
  ctaLabel: z.string().nullable(),
  ctaHref: z.string().nullable(),
  subjectType: z.string().nullable(),
  subjectId: z.string().nullable(),
  groupKey: z.string().nullable(),
  status: notificationStatusSchema,
  readAt: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  createdAt: z.string(),
});

export type Notification = z.infer<typeof notificationSchema>;

export const notificationQuerySchema = pageQuerySchema.extend({
  class: notificationClassSchema.optional(),
  status: notificationStatusSchema.optional(),
});

export type NotificationQuery = z.infer<typeof notificationQuerySchema>;

/**
 * What the bell shows.
 *
 * `badge` counts only what BADGES — action required and alerts. FYI never
 * contributes, because a badge that never clears trains people to ignore it.
 */
export const bellSchema = z.object({
  badge: z.number().int(),
  actionRequired: z.number().int(),
  alerts: z.number().int(),
  fyi: z.number().int(),
  items: z.array(notificationSchema),
});

export type Bell = z.infer<typeof bellSchema>;

export const markReadSchema = z.object({
  notificationIds: z.array(z.string()).max(500).optional(),
  /** Marks every FYI and ALERT read. Action-required rows are unaffected. */
  all: z.boolean().default(false),
});

export type MarkReadInput = z.infer<typeof markReadSchema>;

export const sweepResultSchema = z.object({
  raised: z.number().int(),
  resolved: z.number().int(),
  unchanged: z.number().int(),
});

export type SweepResult = z.infer<typeof sweepResultSchema>;

/** One entry in the catalogue, so the set is inspectable rather than implied. */
export const notificationTypeSchema = z.object({
  type: z.string(),
  class: notificationClassSchema,
  title: z.string(),
  description: z.string(),
  /** Whether the engine currently raises it. */
  status: z.enum(["LIVE", "SPECIFIED"]),
  /** What makes it go away. */
  clearsWhen: z.string(),
});

export type NotificationType = z.infer<typeof notificationTypeSchema>;
