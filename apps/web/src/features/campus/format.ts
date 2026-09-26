/**
 * How the college portal writes a date.
 *
 * The same rule both other portals follow, and for the same reason: `7/9/2026`
 * is the 7th of September to some readers and the 9th of July to others, and an
 * institution planning a cohort is exactly the wrong audience for that.
 */
export function campusDay(value: string): string {
  return format(value, { weekday: "short", day: "numeric", month: "short" });
}

/** The same without the weekday, for a line that already carries enough. */
export function campusDate(value: string): string {
  return format(value, { day: "numeric", month: "short", year: "numeric" });
}

function format(value: string, options: Intl.DateTimeFormatOptions): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00.000Z`)
    : new Date(value);
  return date.toLocaleDateString("en-IN", { ...options, timeZone: "UTC" });
}

/**
 * A status, as a sentence rather than an enum.
 *
 * `UNDER_REVIEW` on a college's own screen should say who is reviewing it. The
 * console can show the raw status because an operator knows the workflow; the
 * institution reading "NEW" learns nothing about whether they are waiting or we
 * are.
 */
export const REQUIREMENT_STATE: Record<string, { label: string; detail: string; waiting: boolean }> = {
  NEW: { label: "With Gurukulam", detail: "We have your request and will come back to you.", waiting: true },
  UNDER_REVIEW: { label: "Being scoped", detail: "We are working out dates and a trainer.", waiting: true },
  CONFIRMED: { label: "Confirmed", detail: "A batch has been opened for this.", waiting: false },
  FULFILLED: { label: "Delivered", detail: "The cohort this produced has finished.", waiting: false },
  REJECTED: { label: "Declined", detail: "We could not take this one on.", waiting: false },
};
