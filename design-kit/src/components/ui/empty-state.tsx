import type { ReactNode } from "react";

import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: IconName;
  /** Primary recovery action — what the operator should do next. */
  action?: ReactNode;
  className?: string;
}

/** Shown wherever a collection is legitimately empty. Never a bare "No data". */
export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center", className)}>
      {icon ? (
        <span className="flex size-14 items-center justify-center rounded-well bg-surface-sunken text-ink-subtle">
          <Icon name={icon} />
        </span>
      ) : null}
      <p className="text-h3 text-ink">{title}</p>
      {description ? <p className="max-w-sm text-body-sm text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
