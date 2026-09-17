import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

const chipVariants = cva("inline-flex items-center gap-1 whitespace-nowrap", {
  variants: {
    variant: {
      /** 10% wash of `color` — the design's module/domain tag. */
      tinted: "tinted-surface rounded-chip px-2 py-[3.5px] text-caption font-bold uppercase",
      /** Solid pill on a coloured panel. */
      solid: "rounded-full bg-surface px-3 py-1 text-body-sm tracking-[0.8px] uppercase",
      /** Hairline pill for filters and metadata. */
      outline: "rounded-full border border-hairline px-3 py-1 text-body-sm text-ink-muted",
    },
  },
  defaultVariants: { variant: "tinted" },
});

export interface ChipProps extends VariantProps<typeof chipVariants> {
  children: ReactNode;
  /**
   * Any CSS colour — usually a token from `@/design-system/tokens`. The
   * `tinted` variant derives both text and background from it.
   */
  color?: string;
  className?: string;
}

export function Chip({ children, color, variant, className }: ChipProps) {
  return (
    <span className={cn(chipVariants({ variant }), className)} style={color ? { color } : undefined}>
      {children}
    </span>
  );
}
