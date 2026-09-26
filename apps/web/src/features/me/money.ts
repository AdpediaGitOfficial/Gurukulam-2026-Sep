import { formatRupees, formatRupeesShort, fromWire, type MoneyMinor } from "@gurukulam/contracts";

/**
 * Money, on a student's screen.
 *
 * ── Why the portal has its own formatter ────────────────────────────────
 *
 * Not because the rendering differs — it calls the same `formatRupees` the
 * console does — but because the CONVERSION does, and it must happen in
 * exactly one place. Every amount arrives as a decimal string of paise, and
 * the only correct thing to do with it is `fromWire` into a `bigint`. A screen
 * that reached for `Number(minor) / 100` would be wrong by paise on a real
 * schedule, and wrong in a way nobody notices until a reconciliation.
 *
 * Nothing in the portal adds, subtracts or compares money. The API does the
 * arithmetic in `bigint`; this turns the answer into words.
 */
export function rupees(minor: MoneyMinor, options: { paise?: boolean } = {}): string {
  return formatRupees(fromWire(minor), { paise: options.paise ?? false });
}

/** Whether there is anything left on this amount. Never a float comparison. */
export function isPositive(minor: MoneyMinor): boolean {
  return fromWire(minor) > 0n;
}

/**
 * How far through paying this is, 0–100.
 *
 * Done in `bigint` up to the last step so the division that produces a
 * percentage — the one place a float is unavoidable — happens once, on a
 * number that is already a ratio rather than on the money itself.
 */
export function paidPercent(paid: MoneyMinor, payable: MoneyMinor): number {
  const total = fromWire(payable);
  if (total <= 0n) return 0;
  const done = fromWire(paid);
  const capped = done > total ? total : done < 0n ? 0n : done;
  return Number((capped * 100n) / total);
}

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
