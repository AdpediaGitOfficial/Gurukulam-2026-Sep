import { formatRupees, fromWire, type MoneyMinor } from "@gurukulam/contracts";

/**
 * Money, on a portal screen.
 *
 * ── Why the conversion lives below the features ─────────────────────────
 *
 * Every amount arrives as a decimal string of paise, and the only correct thing
 * to do with it is `fromWire` into a `bigint`. A screen that reached for
 * `Number(minor) / 100` would be wrong by paise on a real schedule, and wrong in
 * a way nobody notices until a reconciliation.
 *
 * It began in `features/me` and two portals now need it. A feature importing
 * from another feature is the bug the dependency rule exists to stop, and
 * copying three lines of money arithmetic into a second slice is how two
 * screens come to round differently. So the conversions sit in `lib`, where
 * both may reach them, and each portal keeps only what is genuinely its own —
 * `features/me/money.ts` still owns the job-posting pay band, because nothing
 * else has a pay band.
 *
 * Nothing in any portal adds, subtracts or compares money. The API does the
 * arithmetic in `bigint`; these turn the answer into words.
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
 * Done in `bigint` up to the last step, so the division that produces a
 * percentage — the one place a float is unavoidable — happens once, on a number
 * that is already a ratio rather than on the money itself.
 */
export function paidPercent(paid: MoneyMinor, payable: MoneyMinor): number {
  const total = fromWire(payable);
  if (total <= 0n) return 0;
  const done = fromWire(paid);
  const capped = done > total ? total : done < 0n ? 0n : done;
  return Number((capped * 100n) / total);
}
