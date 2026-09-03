import type { ReactNode } from "react";

import { Breadcrumbs, type Crumb } from "@/components/ui/breadcrumbs";
import { cn } from "@/lib/cn";

export interface PageHeaderProps {
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
        <h1 className="text-h1 text-ink">{title}</h1>
        {description ? <p className="text-body text-ink-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
