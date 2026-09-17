import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

export interface StatTileProps {
  label: string;
  /** Preformatted for display — use `formatCount` / `formatPercent`. */
  value: string;
  caption?: string;
  icon: IconName;
  /** Accent colour token, e.g. `domainTokens.students`. */
  color: string;
  /**
   * Period-over-period movement, as a already-formatted phrase and a
   * direction — "+12 this month", "up".
   *
   * Optional because most tiles are a standing count where a delta would be
   * meaningless: "24 colleges, +0" tells nobody anything. It belongs on the
   * figures that MOVE, and the direction is carried by a word and an arrow as
   * well as a colour, because green-means-up is not available to everyone.
   */
  delta?: { text: string; direction: "up" | "down" | "flat" };
  /** When set, the whole tile becomes a link into that module. */
  href?: Route;
  className?: string;
}

/**
 * The standard headline-number tile: coloured icon well, label, value, caption.
 * Use for any "count of things" summary, in any module.
 */
export function StatTile({ label, value, caption, delta, icon, color, href, className }: StatTileProps) {
  const content = (
    <>
      <span
        className="tinted-surface flex size-14 shrink-0 items-center justify-center rounded-well"
        style={{ color }}
      >
        <Icon name={icon} />
      </span>

      <span className="min-w-0">
        {/*
          Wraps rather than truncates. A four-tile row makes a label like
          "Certificates to approve" narrow, and a clipped label is useless —
          `balance` keeps the two lines even rather than leaving one word alone.
        */}
        <span className="block text-balance text-body" style={{ color }}>
          {label}
        </span>
        <span className="flex flex-wrap items-baseline gap-2">
          <span className="text-h1 text-ink">{value}</span>
          {delta ? <Delta {...delta} /> : null}
        </span>
        {caption ? <span className="block text-caption text-ink-muted">{caption}</span> : null}
      </span>
    </>
  );

  return (
    <Card
      className={cn(
        // `min-w-0` stops the tile forcing its grid track wider than the
        // viewport when the label or caption is long.
        "flex min-w-0 items-center gap-4",
        href && "transition-shadow hover:shadow-raised",
        className,
      )}
    >
      {href ? (
        <Link href={href} className="flex min-w-0 flex-1 items-center gap-4">
          {content}
        </Link>
      ) : (
        content
      )}
    </Card>
  );
}

export interface StatTileGridProps {
  children: ReactNode;
  className?: string;
}

/** Responsive row of `StatTile`s — 1 / 2 / 4 across. */
export function StatTileGrid({ children, className }: StatTileGridProps) {
  return (
    <div className={cn("grid gap-6 sm:grid-cols-2 xl:grid-cols-4", className)}>{children}</div>
  );
}

/**
 * Which way a figure moved, and by how much.
 *
 * The arrow and the words carry the direction; the colour only reinforces it.
 * A red number that means "collections fell" and a red number that means
 * "overdue rose" are the same red doing opposite jobs, so the text has to be
 * able to stand alone — and for a reader who cannot tell the two reds apart,
 * it does.
 */
function Delta({ text, direction }: { text: string; direction: "up" | "down" | "flat" }) {
  const tone =
    direction === "up"
      ? "text-success-text"
      : direction === "down"
        ? "text-danger"
        : "text-ink-muted";
  const arrow = direction === "up" ? "↑" : direction === "down" ? "↓" : "→";
  return (
    <span className={`text-body-sm font-medium tabular-nums ${tone}`}>
      <span aria-hidden>{arrow} </span>
      {text}
    </span>
  );
}
