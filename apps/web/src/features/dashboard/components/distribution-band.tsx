import Link from "next/link";
import type { Route } from "next";

import { formatCount } from "@/lib/format";

/**
 * A whole population, bucketed, in one strip.
 *
 * ── Why this and not a list ──────────────────────────────────────────────
 *
 * A ranked list of ten describes ten rows. At 1,217 courses it leaves 1,207
 * undescribed and invites the only question that matters — "why those ten".
 * This describes every row, in fixed vertical space, at any size the business
 * reaches. That is the whole reason it exists.
 *
 * ── Why every segment is a link ─────────────────────────────────────────
 *
 * A distribution that cannot be opened is trivia. "486 not scheduled" is worth
 * knowing only if the next click is those 486 rows with the filter already
 * applied, which is what `href` carries.
 *
 * ── Identity is never colour alone ──────────────────────────────────────
 *
 * The legend names and counts every segment, so the band is read against words
 * rather than against a swatch. That is also what licenses the two lightest
 * steps of the delivery ramp, which fall under 3:1 on the card — the palette
 * validator flags exactly that and asks for visible labels as relief.
 */

export interface BandSlice {
  /** The stable key, used for React identity and nothing else. */
  key: string;
  label: string;
  count: number;
  color: string;
  href: Route;
  /** What this bucket actually means, on hover and for a screen reader. */
  title: string;
}

export function DistributionBand({
  slices,
  caption,
  total,
}: {
  slices: readonly BandSlice[];
  /** Names the quantity and the population — "Delivery progress, all 1,217". */
  caption: string;
  total: number;
}) {
  // The denominator is passed in rather than summed, so a band whose buckets
  // do not add up to the population it claims shows as a short bar instead of
  // silently rescaling itself to look complete.
  const safeTotal = total > 0 ? total : 0;

  return (
    <section className="flex flex-col gap-3" aria-label={caption}>
      <p className="text-caption font-semibold uppercase tracking-wide text-ink-subtle">
        {caption}
      </p>

      {safeTotal === 0 ? (
        <p className="rounded-well bg-surface-sunken px-4 py-3 text-body-sm text-ink-muted">
          Nothing to describe yet.
        </p>
      ) : (
        <>
          {/* `gap` rather than borders: 2px of surface between segments is the
              mark spec, and it is what keeps two adjacent steps of one hue
              readable as two things. */}
          <div
            className="flex h-4 gap-0.5 overflow-hidden rounded-full border border-hairline-strong bg-surface-muted"
            role="img"
            aria-label={`${caption}. ${slices
              .map((s) => `${s.label}: ${formatCount(s.count)}`)
              .join(", ")}.`}
          >
            {slices.map((slice) =>
              slice.count === 0 ? null : (
                <span
                  key={slice.key}
                  className="block first:rounded-l-full last:rounded-r-full"
                  style={{
                    width: `${(slice.count / safeTotal) * 100}%`,
                    backgroundColor: slice.color,
                  }}
                >
                  <span className="sr-only">{slice.title}</span>
                </span>
              ),
            )}
          </div>

          {/* Two columns, so four buckets read as a balanced 2×2 rather than
              three across with the fourth stranded alone on a second row. */}
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
            {slices.map((slice) => (
              <li key={slice.key}>
                <Link
                  href={slice.href}
                  title={slice.title}
                  className="-mx-2 flex items-baseline gap-2 rounded-tile px-2 py-1 hover:bg-surface-sunken"
                >
                  <span
                    aria-hidden
                    className="mt-1 size-2.5 shrink-0 rounded-chip"
                    style={{ backgroundColor: slice.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-body-sm text-ink-muted">
                    {slice.label}
                  </span>
                  <span className="text-body-sm font-semibold tabular-nums text-ink">
                    {formatCount(slice.count)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
