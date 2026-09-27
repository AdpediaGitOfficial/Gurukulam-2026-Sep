/**
 * How the trainer portal writes a date.
 *
 * The same rule the student portal follows and for the same reason: `7/9/2026`
 * is the 7th of September to some readers and the 9th of July to others, and
 * somebody planning their teaching week is exactly the wrong audience for that
 * ambiguity.
 */
export function teachDay(value: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00.000Z`)
    : new Date(value);
  return date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** The same without the weekday, for a line that already carries enough. */
export function teachDate(value: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00.000Z`)
    : new Date(value);
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
