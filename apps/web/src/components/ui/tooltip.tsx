import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface TooltipProps {
  /** The text shown on hover and focus. Also the accessible description. */
  label: string;
  children: ReactNode;
  side?: "top" | "bottom" | "right";
  /**
   * Horizontal anchoring for `top` / `bottom`. Use `end` when the trigger sits
   * near a container's right edge so the bubble extends inward, not outward.
   */
  align?: "center" | "end";
  className?: string;
}

const POSITION: Record<"top" | "bottom" | "right", Record<"center" | "end", string>> = {
  top: {
    center: "bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2",
    end: "bottom-[calc(100%+6px)] right-0",
  },
  bottom: {
    center: "top-[calc(100%+6px)] left-1/2 -translate-x-1/2",
    end: "top-[calc(100%+6px)] right-0",
  },
  right: {
    center: "left-[calc(100%+10px)] top-1/2 -translate-y-1/2",
    end: "left-[calc(100%+10px)] top-1/2 -translate-y-1/2",
  },
};

/**
 * CSS-only tooltip. Reveals on hover *and* keyboard focus, so it is reachable
 * without a pointer. For anything longer than a short phrase, use inline text.
 *
 * Not for repeated table-row actions — inside a card with clipped overflow the
 * bubble gets cut off, and one per row is noise. Use `aria-label` + `title` there.
 */
export function Tooltip({
  label,
  children,
  side = "top",
  align = "center",
  className,
}: TooltipProps) {
  return (
    <span className={cn("group relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-40 rounded-control bg-ink px-2 py-1 text-caption whitespace-nowrap text-white opacity-0 shadow-floating transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
          POSITION[side][align],
        )}
      >
        {label}
      </span>
    </span>
  );
}
