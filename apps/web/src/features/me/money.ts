import { formatRupees, fromWire, type MoneyMinor } from "@gurukulam/contracts";

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
