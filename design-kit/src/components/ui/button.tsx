import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

/**
 * Button hierarchy — one ladder for the whole product.
 *
 * 1. `primary`   the single most important action on a view. Never two.
 * 2. `secondary` supporting actions that sit beside it (search, export, cancel).
 * 3. `ghost`     icon-only chrome and low-emphasis controls.
 * 4. `link`      inline navigation inside a card or sentence.
 * 5. `danger`    destructive confirmation only — never the resting state of a
 *                delete control, which stays `ghost` until hovered.
 *
 * There is deliberately no second filled colour. "Create a record" is `primary`
 * on every screen, so the action reads the same in every module.
 */
export const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-brand text-white shadow-raised hover:bg-brand/90 active:bg-brand/95",
        /**
         * The one "inactive action" treatment: a filled grey pill, no border.
         * Same `surface-muted` fill as an unselected filter tab, so a resting
         * control looks the same wherever it appears.
         */
        secondary: "bg-surface-muted text-ink hover:bg-neutral active:bg-neutral",
        ghost: "text-ink-muted hover:bg-ink/5 active:bg-ink/10",
        danger: "bg-danger text-white shadow-raised hover:bg-danger/90",
        link: "text-gold underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 px-4 text-body-sm",
        md: "h-12 px-6 text-body",
        icon: "size-10 px-0",
        inline: "h-auto p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ variant, size, className, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
