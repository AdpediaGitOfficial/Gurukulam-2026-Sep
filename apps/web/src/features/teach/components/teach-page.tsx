import type { ReactNode } from "react";
import Link from "next/link";

import { cn } from "@/lib/cn";

/**
 * The trainer portal's page grammar.
 *
 * Shares the student portal's shape — an eyebrow, a `text-metric` title, one
 * question per screen — because both are portals and a person who learned one
 * should not have to learn the other. What differs is the colour each spends:
 * amber there, `teach` here, and neither borrows the console's terracotta.
 *
 * It is its own file rather than an import from `features/me`, because a
 * portal's grammar is the one thing that must be free to move without dragging
 * another product with it.
 */
export function TeachPage({
  eyebrow,
  title,
  description,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="flex min-w-0 flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 max-w-full flex-col gap-1">
          <span className="text-overline text-ink-subtle uppercase">{eyebrow}</span>
          <h1 className="text-metric break-words text-ink">{title}</h1>
          {description === undefined ? null : (
            <p className="text-body break-words text-ink-muted">{description}</p>
          )}
        </div>
        {action === undefined ? null : <div className="flex max-w-full flex-wrap gap-2">{action}</div>}
      </header>
      {children}
    </div>
  );
}

export function TeachCard({
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
    <section
      className={cn("min-w-0 rounded-card border border-hairline bg-surface p-5 sm:p-6", className)}
    >
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

/** The one card on a screen that is an appointment rather than information. */
export function TeachHighlight({ children }: { children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-card border border-teach/40 border-l-4 border-l-teach bg-teach-soft p-5 sm:p-6">
      {children}
    </section>
  );
}

/**
 * A figure and what it counts.
 *
 * `danger` is spent on the two that mean work left undone — a register never
 * taken, a submission never marked. Everything else is neutral, because a
 * dashboard where every number is coloured is one where none of them is.
 */
export function TeachStat({
  label,
  value,
  caption,
  intent = "neutral",
  href,
}: {
  label: string;
  value: string | number;
  caption?: string;
  intent?: "neutral" | "danger" | "success";
  href?: string;
}) {
  const body = (
    <>
      <span className="text-overline text-ink-subtle uppercase">{label}</span>
      <span
        className={cn(
          "text-metric-sm tabular-nums",
          intent === "danger"
            ? "text-danger"
            : intent === "success"
              ? "text-success-strong"
              : "text-ink",
        )}
      >
        {value}
      </span>
      {caption === undefined ? null : (
        <span className="text-caption text-ink-subtle">{caption}</span>
      )}
    </>
  );

  // A figure that names work to do links to the work. One that is context
  // does not — a link that goes nowhere useful is a link people stop trying.
  return href === undefined ? (
    <div className="flex min-w-0 flex-col gap-0.5">{body}</div>
  ) : (
    <Link
      href={href}
      className="flex min-w-0 flex-col gap-0.5 rounded-well transition-colors hover:bg-surface-sunken"
    >
      {body}
    </Link>
  );
}
