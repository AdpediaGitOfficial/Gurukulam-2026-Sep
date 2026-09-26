import { formatRupeesShort, fromWire, type MoneyMinor } from "@gurukulam/contracts";

/**
 * Money, on a student's screen.
 *
 * ── Why the three conversions moved to `lib/money` ──────────────────────
 *
 * They were here first, and then the college portal needed the same three. A
 * feature importing from another feature is the bug the dependency rule exists
 * to stop, and a second copy of money arithmetic is how two screens come to
 * round differently — so `rupees`, `isPositive` and `paidPercent` now live in
 * `lib`, below both, and are re-exported here so nothing that reads them had to
 * move.
 *
 * What stays is what is genuinely the student portal's: the pay band on a job
 * posting. Nothing else in the product has a pay band.
 */
export { isPositive, paidPercent, rupees } from "@/lib/money";

/**
 * A pay band, at the size a card can carry.
 *
 * ── Why this one abbreviates and the fee screens do not ─────────────────
 *
 * `formatRupeesShort` exists because eight digits with commas cannot be read at
 * a glance — you end up counting groups to work out lakhs from crores. A fee
 * instalment is reconciled against, so it keeps every digit. A salary band is
 * scanned, never added up, and "₹6 L – ₹9 L a year" is the figure a person
 * actually holds in their head.
 *
 * Integer arithmetic all the way down, like everything else touching money: the
 * scaling divides paise by a `bigint` and formats the remainder as digits.
 */
export function payBand(
  min: MoneyMinor | null,
  max: MoneyMinor | null,
  period: string | null,
): string | null {
  if (min === null && max === null) return null;

  const low = min === null ? null : formatRupeesShort(fromWire(min));
  const high = max === null ? null : formatRupeesShort(fromWire(max));
  const amount =
    low !== null && high !== null
      ? low === high
        ? low
        : `${low} – ${high}`
      : // One end only is a real state on a real posting: "from ₹6 L" is what
        // an employer wrote, and inventing the other end would be a number
        // nobody offered.
        low !== null
        ? `from ${low}`
        : `up to ${high}`;

  const per = PERIOD[(period ?? "").toUpperCase()];
  return per === undefined ? amount : `${amount} ${per}`;
}

/**
 * The column is free text, so this maps what we write and passes anything else
 * through by omitting it — a period we do not recognise is better left off than
 * printed raw beside a figure, where "₹6 L ANNUAL" reads as a spreadsheet cell.
 */
const PERIOD: Record<string, string> = {
  ANNUAL: "a year",
  YEARLY: "a year",
  YEAR: "a year",
  MONTHLY: "a month",
  MONTH: "a month",
  WEEKLY: "a week",
  DAILY: "a day",
  HOURLY: "an hour",
};
