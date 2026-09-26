import type { ReactNode } from "react";
import Link from "next/link";

import { cn } from "@/lib/cn";

/**
 * The college portal's page grammar.
 *
 * Shares the shape both other portals use — an eyebrow, a `text-metric` title,
 * one question per screen — because a person who learned one should not have to
 * learn a third. What differs is the colour each spends: amber on the student's,
 * green on the trainer's, indigo here, and the console's terracotta on none of
 * them.
 *
 * Its own file rather than an import, for the reason the trainer's is: a
 * portal's grammar has to be free to move without dragging another product with
 * it.
 */
export function CampusPage({
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
        {action === undefined ? null : (
          <div className="flex max-w-full flex-wrap gap-2">{action}</div>
        )}
      </header>
      {children}
    </div>
  );
}

export function CampusCard({
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
export function CampusHighlight({ children }: { children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-card border border-campus/40 border-l-4 border-l-campus bg-campus-soft p-5 sm:p-6">
      {children}
    </section>
  );
}

/**
 * A figure and what it counts.
 *
 * ── Why "with us" is never coloured as a problem ────────────────────────
 *
 * Half the figures on a college's overview are OUR queue, not theirs: a
 * requirement they raised and we have not answered, a list of names they
 * submitted and we have not reviewed. Colouring those as work would read as a
 * reproach for something they already did. `danger` is spent only on what is
 * genuinely theirs to fix — money past its due date — and `waiting` says the
 * ball is with us in words instead.
 */
export function CampusStat({
  label,
  value,
  caption,
  intent = "neutral",
  href,
}: {
  label: string;
  value: string | number;
  caption?: string;
  intent?: "neutral" | "danger" | "success" | "waiting";
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
              : intent === "waiting"
                ? "text-on-campus"
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

/** A small key-and-value pair, for the record panels. */
export function CampusField({
  label,
  value,
  mono = false,
  wide = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", wide && "sm:col-span-2")}>
      <dt className="text-overline text-ink-subtle uppercase">{label}</dt>
      <dd className={cn("min-w-0 break-words text-body text-ink", mono && "font-mono text-caption")}>
        {value === null || value === "" ? <span className="text-ink-subtle">—</span> : value}
      </dd>
    </div>
  );
}
