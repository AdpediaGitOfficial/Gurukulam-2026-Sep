import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface DonutSegment {
  id: string;
  label: string;
  /** Share of the ring, expressed in percent. Segments should total 100. */
  percentage: number;
  color: string;
}

export interface DonutChartProps {
  segments: readonly DonutSegment[];
  /** Outer diameter in px. */
  size?: number;
  /** Ring thickness in px. */
  thickness?: number;
  /**
   * Full-circle background drawn behind the segments. Supply it to turn the
   * ring into a gauge, where the unfilled remainder stays visible.
   */
  track?: string;
  /** Rendered in the middle of the ring. */
  children?: ReactNode;
  /**
   * Overrides the description generated from `segments`. Pass `null` when the
   * ring is decorative because `children` already state the value.
   */
  ariaLabel?: string | null;
  className?: string;
}

/**
 * Renders segment shares as a stroked ring.
 *
 * The geometry is derived from the data rather than baked into a static asset,
 * so the same component serves any future breakdown without a design round-trip.
 */
export function DonutChart({
  segments,
  size = 192,
  thickness = 16,
  track,
  children,
  ariaLabel,
  className,
}: DonutChartProps) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const arcs = segments.map((segment, index) => {
    const precedingShare = segments
      .slice(0, index)
      .reduce((total, preceding) => total + preceding.percentage, 0);

    return {
      ...segment,
      length: (segment.percentage / 100) * circumference,
      // Strokes start at 3 o'clock, so the ring as a whole is rotated -90deg.
      offset: -(precedingShare / 100) * circumference,
    };
  });

  const label =
    ariaLabel === undefined
      ? segments.map((s) => `${s.label}: ${s.percentage}%`).join(", ")
      : ariaLabel;

  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role={label === null ? "presentation" : "img"}
        aria-hidden={label === null || undefined}
        aria-label={label ?? undefined}
        className="-rotate-90"
      >
        {track ? (
          <circle cx={center} cy={center} r={radius} fill="none" stroke={track} strokeWidth={thickness} />
        ) : null}
        {arcs.map((arc) => (
          <circle
            key={arc.id}
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={arc.color}
            strokeWidth={thickness}
            strokeDasharray={`${arc.length} ${circumference - arc.length}`}
            strokeDashoffset={arc.offset}
          />
        ))}
      </svg>
      {children ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
      ) : null}
    </div>
  );
}
