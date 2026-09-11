import type { ReactNode } from "react";

import { feedbackTextTokens, feedbackTokens, type FeedbackIntent } from "@/design-system/tokens";
import { cn } from "@/lib/cn";

export interface StatusDotProps {
  color: string;
  className?: string;
}

export function StatusDot({ color, className }: StatusDotProps) {
  return (
    <span
      aria-hidden
      className={cn("size-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: color }}
    />
  );
}

export interface StatusPillProps {
  intent: FeedbackIntent;
  children: ReactNode;
  className?: string;
}

/**
 * Dot + label, the standard way to render a record's state in a table or list.
 *
 * The dot uses the vivid base colour; the label uses the darker text-safe shade,
 * because several intents fall under 4.5:1 on white at their base value.
 */
export function StatusPill({ intent, children, className }: StatusPillProps) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-body", className)}
      style={{ color: feedbackTextTokens[intent] }}
    >
      <StatusDot color={feedbackTokens[intent]} />
      {children}
    </span>
  );
}
