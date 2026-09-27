import type { ReactNode } from "react";

import { Breadcrumbs, type Crumb } from "@/components/ui/breadcrumbs";
import { cn } from "@/lib/cn";

export interface PageHeaderProps {
  /**
   * The module this page belongs to, set above the title in small caps. It is
   * what tells an operator which part of the product they are in when a page is
   * reached from a link rather than from the rail.
   */
  eyebrow?: string;
  title: string;
  description?: string;
  breadcrumbs?: readonly Crumb[];
  /** Primary call to action, rendered at the end of the row. */
  action?: ReactNode;
  className?: string;
}

/**
 * The `h1` block every console page opens with. Using it everywhere is what
 * keeps page titles, spacing and heading levels consistent across modules.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  breadcrumbs,
  action,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        {breadcrumbs?.length ? <Breadcrumbs items={breadcrumbs} className="mb-1" /> : null}
        {eyebrow === undefined ? null : (
          <span className="mb-1 block text-overline text-ink-muted uppercase">{eyebrow}</span>
        )}
        <h1 className="text-balance text-h1 text-ink">{title}</h1>
        {/* `break-words` because this line is usually a record's identity —
            a code and an email address joined by a dot — and an address has no
            space in it to wrap at. Without it a long one overflows its column
            and takes the page sideways; `min-w-0` on the parent lets the
            column shrink but cannot break a word. */}
        {description ? (
          <p className="text-body break-words text-ink-muted">{description}</p>
        ) : null}
      </div>
      {/*
        `shrink-0` keeps the action row off the title's line at ordinary widths;
        `max-w-full` is what stops it taking the whole page sideways at 400px.
        Without it the slot sizes to max-content, so a row of four verbs measures
        432px in a 320px column and a `flex-wrap` inside it never wraps — there
        is nothing bounding it to wrap against. The cap resolves against the
        header row, which is the page.
      */}
      {action ? <div className="max-w-full shrink-0">{action}</div> : null}
    </div>
  );
}
