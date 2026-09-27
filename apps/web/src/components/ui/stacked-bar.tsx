import { cn } from "@/lib/cn";

export interface StackedBarSegment {
  id: string;
  label: string;
  /** Share of the whole, in percent. Segments should total 100. */
  percentage: number;
  color: string;
}

export interface StackedBarProps {
  segments: readonly StackedBarSegment[];
  /** Bar thickness in px. */
  height?: number;
  /**
   * Overrides the description generated from `segments`. Pass `null` when an
   * adjacent legend already states every value.
   */
  ariaLabel?: string | null;
  className?: string;
}

/**
 * A part-to-whole split rendered as one horizontal bar.
 *
 * Use it wherever shares sum to 100 and the reader should see the proportions
 * at a glance — it carries the same information as a list of percentages, but
 * comparably faster to read.
 */
export function StackedBar({ segments, height = 10, ariaLabel, className }: StackedBarProps) {
  const label =
    ariaLabel === undefined
      ? segments.map((s) => `${s.label}: ${s.percentage}%`).join(", ")
      : ariaLabel;

  return (
    <div
      role={label === null ? "presentation" : "img"}
      aria-hidden={label === null || undefined}
      aria-label={label ?? undefined}
      style={{ height }}
      className={cn("flex w-full overflow-hidden rounded-full bg-neutral", className)}
    >
      {segments.map((segment) => (
        <span
          key={segment.id}
          className="h-full"
          style={{ width: `${segment.percentage}%`, backgroundColor: segment.color }}
        />
      ))}
    </div>
  );
}
