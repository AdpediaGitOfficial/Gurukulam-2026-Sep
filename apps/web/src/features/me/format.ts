/**
 * How the portal writes a date.
 *
 * `toLocaleDateString("en-IN")` gives `7/9/2026`, which is the 7th of
 * September to some readers and the 9th of July to others — and a student
 * reading their own class schedule is exactly the wrong audience for that
 * ambiguity. Naming the month costs six characters and removes the question.
 *
 * One function rather than a copy per card, because a date that reads two ways
 * on two screens of the same portal is the same fault one level up.
 */
export function portalDay(value: string): string {
  // A bare `YYYY-MM-DD` is a calendar day, not an instant: parsed without the
  // explicit UTC midnight it shifts a day either side depending on the reader's
  // timezone, which is how a Monday class turns into a Sunday one.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : new Date(value);
  return date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** The same day without the weekday, for a line that already has enough in it. */
export function portalDate(value: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : new Date(value);
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
