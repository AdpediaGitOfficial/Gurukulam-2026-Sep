import type { ReactNode } from "react";
import Link from "next/link";

import { cn } from "@/lib/cn";

/**
 * The portal's page and section grammar.
 *
 * ── Why the portal does not use `PageHeader` and `PageSection` ──────────
 *
 * Those are the console's, and the console is unchanged. Its page title is
 * `text-h1` — 20px — which is right when nine modules, a search field and a
 * filter toolbar are competing for the same screen. A portal screen holds one
 * thing, and its title is the only heading above the fold, so it takes the
 * room: `text-metric`, the largest size on the scale that is not a hero
 * figure.
 *
 * Same tokens either way. What differs is which of them each surface spends.
 */

export function PortalPage({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="flex min-w-0 flex-col gap-1">
        <span className="text-overline text-ink-subtle uppercase">{eyebrow}</span>
        <h1 className="text-metric break-words text-ink">{title}</h1>
        {description === undefined ? null : (
          <p className="text-body break-words text-ink-muted">{description}</p>
        )}
      </header>
      {children}
    </div>
  );
}

/**
 * A panel with a heading and, on the right, the one link that opens the whole
 * of what it is summarising.
 *
 * The action is deliberately a LINK and never a verb. A portal summary card
 * says what is true; the place to act on it is the screen it points at.
 */
export function PortalCard({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: { href: string; label: string };
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-card border border-hairline bg-surface p-5 sm:p-6", className)}>
      {title === undefined ? null : (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 className="text-h3 text-ink">{title}</h2>
          {action === undefined ? null : (
            <Link
              href={action.href}
              className="text-body-sm font-medium text-brand underline-offset-4 hover:underline"
            >
              {action.label}
            </Link>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * The one card on a screen that is not information but an appointment.
 *
 * ── Why it is tinted and edged rather than just bolder ──────────────────
 *
 * `surface-soft` with an amber edge is the product's existing way of saying
 * "this one". A student's first question is when their next class is, and the
 * answer has to be findable at arm's length on a phone in a corridor — which
 * weight alone does not achieve on a screen of white cards.
 *
 * It is used once per screen. A second highlight is no highlight.
 */
export function PortalHighlight({ children }: { children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-card border border-accent/30 border-l-4 border-l-accent bg-surface-soft p-5 sm:p-6">
      {children}
    </section>
  );
}

/**
 * A figure and what it counts.
 *
 * `figure` turns on tabular numerals so a row of them lines up on the decimal
 * — the same reason the console's `DetailRow` has the variant.
 */
export function PortalStat({
  label,
  value,
  caption,
  intent = "neutral",
}: {
  label: string;
  value: string | number;
  caption?: string;
  intent?: "neutral" | "danger" | "success";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-overline text-ink-subtle uppercase">{label}</span>
      <span
        className={cn(
          "text-metric-sm tabular-nums",
          intent === "danger" ? "text-danger" : intent === "success" ? "text-success-strong" : "text-ink",
        )}
      >
        {value}
      </span>
      {caption === undefined ? null : (
        <span className="text-caption text-ink-subtle">{caption}</span>
      )}
    </div>
  );
}
