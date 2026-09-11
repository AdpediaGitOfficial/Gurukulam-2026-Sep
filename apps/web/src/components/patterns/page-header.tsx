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
        {description ? <p className="text-body text-ink-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
