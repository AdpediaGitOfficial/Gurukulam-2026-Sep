import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface PageBodyProps {
  children: ReactNode;
  className?: string;
}

/** Vertical rhythm for a page's top-level blocks. Every page body uses this. */
export function PageBody({ children, className }: PageBodyProps) {
  return <div className={cn("flex min-w-0 flex-col gap-8", className)}>{children}</div>;
}

export interface PageSectionProps {
  /** Accessible name for the region. Rendered visibly unless `hideTitle`. */
  title: string;
  description?: string;
  hideTitle?: boolean;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** A labelled region within a page — gives screen readers a navigable outline. */
export function PageSection({
  title,
  description,
  hideTitle = false,
  action,
  children,
  className,
}: PageSectionProps) {
  return (
    /* `min-w-0` for the same reason `Card` carries it: a section is a grid or
       flex item, and without it a wide table inside makes the section wider
       than its track, which takes the page sideways rather than scrolling the
       table. See `TableScroll`. */
    <section
      aria-label={hideTitle ? title : undefined}
      className={cn("flex min-w-0 flex-col", className)}
    >
      {hideTitle ? null : (
        <div className="flex items-end justify-between gap-4 pb-4">
          <div className="min-w-0">
            <h2 className="text-h2 text-ink">{title}</h2>
            {description ? <p className="text-body-sm text-ink-muted">{description}</p> : null}
          </div>
          {/* `max-w-full` for the reason `PageHeader`'s slot carries it: the
              slot is `shrink-0`, so it sizes to max-content, and a row of
              three verbs then measures wider than the column and takes the
              page sideways with it. The cap gives a `flex-wrap` inside
              something to wrap against. */}
          {action ? <div className="max-w-full shrink-0">{action}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}

export interface SplitLayoutProps {
  /** Wider column — typically a table or primary content. */
  main: ReactNode;
  /** Narrower column — charts, summaries, side panels. */
  aside: ReactNode;
  className?: string;
}

/** The dashboard's 2:1 split, reusable by any module that needs the same shape. */
export function SplitLayout({ main, aside, className }: SplitLayoutProps) {
  return (
    <div className={cn("grid gap-8 xl:grid-cols-3", className)}>
      <div className="min-w-0 xl:col-span-2">{main}</div>
      <div className="min-w-0">{aside}</div>
    </div>
  );
}
