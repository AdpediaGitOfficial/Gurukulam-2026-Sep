import type { ReactNode } from "react";

import { feedbackTokens, type FeedbackIntent } from "@/design-system/tokens";
import { cn } from "@/lib/cn";

export interface AlertProps {
  intent?: FeedbackIntent;
  title: ReactNode;
  children?: ReactNode;
  /** Trailing control, e.g. a "Retry" or "Dismiss" button. */
  action?: ReactNode;
  className?: string;
}

/** Inline, non-blocking message about the state of the current view. */
export function Alert({ intent = "info", title, children, action, className }: AlertProps) {
  const color = feedbackTokens[intent];

  return (
    <div
      role={intent === "danger" ? "alert" : "status"}
      style={{ color }}
      className={cn("tinted-surface flex items-start gap-4 rounded-well p-4", className)}
    >
      <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-current" />
      <div className="min-w-0 flex-1">
        <p className="text-h3">{title}</p>
        {children ? <div className="mt-1 text-body-sm text-ink-muted">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
