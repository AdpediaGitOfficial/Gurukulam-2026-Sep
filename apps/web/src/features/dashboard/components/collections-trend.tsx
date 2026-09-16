import { formatRupees, formatRupeesShort, fromWire, type MonthlyPoint } from "@gurukulam/contracts";

import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { seriesTokens } from "@/design-system/tokens";

/**
 * Twelve months of collections, retail against college.
 *
 * Every other figure on this dashboard is point-in-time. "₹2.86 Cr billed" is
 * a fact; whether that is better or worse than last quarter is the question
 * somebody actually came here to answer, and nothing but a time axis answers
 * it.
 *
 * ── Why grouped columns and not a stacked area ───────────────────────────
 *
 * Because a month can be NEGATIVE. A reversal is real money going back out,
 * and it subtracts from the month it was recorded in. Stacking two series that
 * can each be either sign produces a bar whose height means nothing — the
 * segments cancel and the total is not the sum of what you can see. Grouped
 * columns from a zero baseline keep both readable, and a month that went
 * backwards looks like what it is: a bar below the line.
 *
 * ── Why this is a Server Component ───────────────────────────────────────
 *
 * The hover layer is a native SVG `<title>` per bar. It is less pretty than a
 * custom tooltip and it costs no client JavaScript, needs no hydration, and is
 * read aloud by a screen reader — which a div positioned on mousemove is not.
 * The house rule is that a client component has to earn its place; a tooltip
 * does not.
 */

const WIDTH = 720;
const HEIGHT = 200;
const PAD_LEFT = 8;
const PAD_RIGHT = 8;
const PAD_TOP = 16;
const PAD_BOTTOM = 34;

/** A column with its far end rounded and its baseline end square. */
function columnPath(x: number, y: number, w: number, h: number, up: boolean): string {
  // 4px, or half the bar when the bar is shorter than the radius — otherwise
  // the corners cross and the path folds inside out.
  const r = Math.min(4, Math.abs(h) / 2, w / 2);
  if (h <= 0.5) {
    // A month with nothing in it still gets a mark — a 2px stub on the
    // baseline. It reads as "zero"; NO mark reads as "no data", and those are
    // different claims. Drawn as a filled sliver rather than a stroked line
    // because these paths are filled, and a zero-height stroked path is
    // invisible — which is how the first version of this silently drew ten
    // empty months as nothing at all.
    return `M${x} ${y - 1} h${w} v2 h${-w} Z`;
  }
  return up
    ? `M${x} ${y + h} V${y + r} a${r} ${r} 0 0 1 ${r} ${-r} h${w - 2 * r} a${r} ${r} 0 0 1 ${r} ${r} V${y + h} Z`
    : `M${x} ${y} V${y + h - r} a${r} ${r} 0 0 0 ${r} ${r} h${w - 2 * r} a${r} ${r} 0 0 0 ${r} ${-r} V${y} Z`;
}

const monthLabel = (month: string): string => {
  const [year, m] = month.split("-");
  const date = new Date(Date.UTC(Number(year), Number(m) - 1, 1));
  return date.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" });
};

export function CollectionsTrend({ months }: { months: readonly MonthlyPoint[] }) {
  const points = months.map((m) => ({
    month: m.month,
    retail: fromWire(m.collected.retail),
    college: fromWire(m.collected.college),
  }));

  // The scale is set by the largest ABSOLUTE value, so a month that went
  // backwards is drawn to the same scale as one that went forwards.
  let peak = 0n;
  for (const p of points) {
    for (const v of [p.retail, p.college]) {
      const abs = v < 0n ? -v : v;
      if (abs > peak) peak = abs;
    }
  }

  if (points.length === 0 || peak === 0n) {
    return (
      <Card>
        <CardHeader as="h2" title="Collections over time" description="Retail against college, by month." />
        <EmptyState
          title="Nothing collected yet"
          description="Once payments are recorded against a schedule, twelve months of them appear here."
        />
      </Card>
    );
  }

  const anyNegative = points.some((p) => p.retail < 0n || p.college < 0n);
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  // With no negative month the baseline sits on the floor and the whole plot is
  // above it; with one, it sits in the middle and the plot uses both halves.
  const baseline = anyNegative ? PAD_TOP + plotHeight / 2 : PAD_TOP + plotHeight;
  const reach = anyNegative ? plotHeight / 2 : plotHeight;

  /** Paise to pixels, through Number only at the last step. */
  const scale = (value: bigint): number => {
    const ratio = Number((value * 10_000n) / peak) / 10_000;
    return ratio * reach;
  };

  const slot = (WIDTH - PAD_LEFT - PAD_RIGHT) / points.length;
  // 2px of surface between the two bars in a pair, and a clear gutter between
  // pairs, so a month reads as one group rather than twenty-four bars.
  const barWidth = Math.max(3, (slot - 10) / 2 - 1);

  // One direct label, on the biggest month — a number on every column is noise,
  // and the tooltip carries the rest.
  const biggest = points.reduce(
    (best, p, index) => {
      const total = p.retail + p.college;
      const abs = total < 0n ? -total : total;
      return abs > best.abs ? { index, abs, total } : best;
    },
    { index: -1, abs: 0n, total: 0n },
  );

  return (
    <Card>
      <CardHeader
        as="h2"
        title="Collections over time"
        description="What was actually received each month. A reversal subtracts from the month it was recorded in."
      />

      <div className="mb-3 flex flex-wrap items-center gap-4">
        <Legend color={seriesTokens.retail} label="Retail" />
        <Legend color={seriesTokens.college} label="College" />
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Collections by month for the last ${points.length} months, retail and college shown separately`}
      >
        {/* Recessive: one line at zero, because that is the only reference a
            reader needs when bars can go either way. */}
        <line
          x1={PAD_LEFT}
          y1={baseline}
          x2={WIDTH - PAD_RIGHT}
          y2={baseline}
          stroke="var(--color-hairline-strong)"
          strokeWidth={1}
        />

        {points.map((point, index) => {
          const x = PAD_LEFT + index * slot + 5;
          const retailH = scale(point.retail < 0n ? -point.retail : point.retail);
          const collegeH = scale(point.college < 0n ? -point.college : point.college);
          const retailUp = point.retail >= 0n;
          const collegeUp = point.college >= 0n;
          const total = point.retail + point.college;

          return (
            <g key={point.month}>
              <path
                d={columnPath(x, retailUp ? baseline - retailH : baseline, barWidth, retailH, retailUp)}
                fill={seriesTokens.retail}
              >
                <title>
                  {`${monthLabel(point.month)} ${point.month.slice(0, 4)} · retail ${formatRupees(point.retail, { paise: false })}`}
                </title>
              </path>
              <path
                d={columnPath(
                  x + barWidth + 2,
                  collegeUp ? baseline - collegeH : baseline,
                  barWidth,
                  collegeH,
                  collegeUp,
                )}
                fill={seriesTokens.college}
              >
                <title>
                  {`${monthLabel(point.month)} ${point.month.slice(0, 4)} · college ${formatRupees(point.college, { paise: false })}`}
                </title>
              </path>

              {index === biggest.index ? (
                <text
                  x={x + barWidth + 1}
                  /* A negative column is labelled ABOVE the baseline, in the
                     half that is empty precisely because the month went
                     backwards. Below it, the label either lands on the bar or
                     on the month row underneath — both of which this did
                     before anybody rendered it and looked. */
                  y={
                    total >= 0n
                      ? Math.max(PAD_TOP - 4, baseline - Math.max(retailH, collegeH) - 6)
                      : baseline - 7
                  }
                  textAnchor="middle"
                  className="fill-ink text-[11px] font-semibold"
                >
                  {formatRupeesShort(biggest.total)}
                </text>
              ) : null}

              <text
                x={x + barWidth + 1}
                y={HEIGHT - 8}
                textAnchor="middle"
                className="fill-ink-subtle text-[10px]"
              >
                {monthLabel(point.month)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* The table view the chart is read against — identity is never colour
          alone, and a figure somebody needs exactly is here rather than
          rounded into a tooltip. */}
      <details className="mt-4">
        <summary className="cursor-pointer text-body-sm text-ink-muted">
          The same twelve months as a table
        </summary>
        <table className="mt-3 w-full border-collapse text-body-sm">
          <caption className="sr-only">Collections by month, retail and college</caption>
          <thead>
            <tr className="border-b border-hairline text-left text-caption uppercase tracking-wide text-ink-muted">
              <th scope="col" className="py-2 pr-4 font-medium">Month</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">Retail</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">College</th>
              <th scope="col" className="py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.month} className="border-b border-hairline/60 last:border-0">
                <td className="py-2 pr-4 tabular-nums text-ink-muted">{p.month}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{formatRupees(p.retail, { paise: false })}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{formatRupees(p.college, { paise: false })}</td>
                <td className="py-2 text-right font-semibold tabular-nums">
                  {formatRupees(p.retail + p.college, { paise: false })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </Card>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-2 text-body-sm text-ink-muted">
      <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
