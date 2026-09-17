import Link from "next/link";
import type { Route } from "next";

import { formatCount } from "@/lib/format";

/**
 * The rows somebody has to do something about.
 *
 * The other half of a distribution. The band says what the shape is; this says
 * which records need a decision, and it is bounded by the WORK rather than by
 * a cut-off — which is what makes it a queue rather than one more statistic.
 *
 * ── Zero is a result, not an empty state ────────────────────────────────
 *
 * A cleared queue keeps its row and goes quiet: grey, and "Clear" where the
 * link would be. Hiding it would make the card change shape as the day goes on
 * and, worse, would leave an operator unable to tell "nothing is wrong" from
 * "nobody is checking". Keeping the row also keeps the two cards the same
 * height, which is the only reason they line up.
 */

export type QueueTone = "danger" | "warning";

export interface QueueRow {
  key: string;
  count: number;
  /** What the number counts, in the operator's words — never a column name. */
  label: string;
  /** Severity when the count is non-zero. A cleared row is always quiet. */
  tone: QueueTone;
  href: Route;
}

const TONE: Record<QueueTone, string> = {
  danger: "bg-danger/10 text-danger",
  warning: "bg-warning/10 text-warning-strong",
};

export function AttentionQueue({ rows, caption }: { rows: readonly QueueRow[]; caption: string }) {
  return (
    <section className="flex flex-col gap-3" aria-label={caption}>
      <p className="text-caption font-semibold uppercase tracking-wide text-ink-subtle">
        {caption}
      </p>

      <ul className="flex flex-col border-t border-hairline">
        {rows.map((row) => {
          const clear = row.count === 0;
          return (
            <li key={row.key} className="border-b border-hairline last:border-b-0">
              <Link
                href={row.href}
                className="group flex items-center gap-3 py-2.5 hover:bg-surface-sunken"
              >
                <span
                  className={`min-w-9 rounded-tile px-2 py-0.5 text-center text-body font-bold tabular-nums ${
                    clear ? "bg-surface-sunken text-ink-subtle" : TONE[row.tone]
                  }`}
                >
                  {formatCount(row.count)}
                </span>
                <span className="min-w-0 flex-1 text-body-sm text-ink group-hover:underline">
                  {row.label}
                </span>
                <span className="shrink-0 text-caption text-ink-subtle">
                  {clear ? "Clear" : "Open →"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
