import { formatCount } from "@/lib/format";

/**
 * Two rates, over a stated denominator.
 *
 * ── Why the denominator is on screen ────────────────────────────────────
 *
 * "88.4%" is not a fact until you know what it is 88.4% of. Over four hundred
 * enrolments it is a business; over four it is noise wearing a decimal point,
 * and the two look identical once the division has happened. So the count that
 * produced the rate is printed under it.
 *
 * ── Why nothing is 0% ───────────────────────────────────────────────────
 *
 * When the denominator is zero, or nothing has been recorded, this shows an em
 * dash and says so. A drop-out rate of 0.0% reads as "nobody leaves"; "—" with
 * "not recorded yet" reads as "nobody is counting", which is true and is the
 * thing worth fixing. The columns behind these rates sat empty for months, so
 * this is not a hypothetical distinction.
 */

export interface Rate {
  label: string;
  /** The numerator. */
  count: number;
  /** What it is out of. Zero means the rate is undefined, not zero. */
  of: number;
  /** What "out of" counts, for the caption: "of 152 enrolments". */
  ofNoun: string;
  tone: "good" | "bad" | "plain";
  /** Shown in place of the caption when there is nothing to divide. */
  emptyHint: string;
}

const TONE = {
  good: "text-success-strong",
  bad: "text-danger",
  plain: "text-ink",
} as const;

/** One decimal, truncated — a rate that rounds UP overstates. */
function percent(count: number, of: number): string {
  if (of <= 0) return "—";
  const tenths = Math.floor((count * 1000) / of);
  return `${(tenths / 10).toFixed(1)}%`;
}

export function RatePair({ rates }: { rates: readonly Rate[] }) {
  return (
    <dl className="flex flex-wrap gap-x-10 gap-y-4">
      {rates.map((rate) => {
        const measurable = rate.of > 0;
        return (
          <div key={rate.label} className="flex min-w-24 flex-col gap-0.5">
            <dd
              className={`text-metric tabular-nums ${measurable ? TONE[rate.tone] : "text-ink-subtle"}`}
            >
              {percent(rate.count, rate.of)}
            </dd>
            <dt className="text-body-sm text-ink-muted">{rate.label}</dt>
            <p className="text-caption text-ink-subtle">
              {measurable
                ? `${formatCount(rate.count)} of ${formatCount(rate.of)} ${rate.ofNoun}`
                : rate.emptyHint}
            </p>
          </div>
        );
      })}
    </dl>
  );
}
