import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

/*
 * `min-w-0` is not decoration. A card is almost always a flex or grid item, and
 * such an item defaults to `min-width: auto` — it refuses to shrink below its
 * widest content. A card holding a 900px table therefore became 902px wide
 * inside a 288px grid track, and the scroller inside it sized itself to the
 * card, so nothing scrolled and the page moved instead. Half the call sites had
 * learnt to pass `min-w-0` by hand; the other half had not, which is the
 * definition of a default in the wrong place.
 */
const cardVariants = cva("min-w-0 rounded-card", {
  variants: {
    tone: {
      /** Default white panel used across the console. */
      surface: "border border-hairline bg-surface",
      /** Sunken well for nested/secondary content. */
      sunken: "bg-surface-sunken",
      /** Coloured panel — pair with a `bg-*` override. */
      plain: "",
    },
    padding: {
      none: "",
      md: "p-6",
      lg: "p-8",
    },
  },
  defaultVariants: { tone: "surface", padding: "md" },
});

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export function Card({ tone, padding, className, ...props }: CardProps) {
  return <div className={cn(cardVariants({ tone, padding }), className)} {...props} />;
}

export interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Trailing control, e.g. a "View full log" link or a filter. */
  action?: ReactNode;
  /** Heading level, so nested cards stay in document order. Defaults to `h3`. */
  as?: "h2" | "h3" | "h4";
  className?: string;
}

export function CardHeader({
  title,
  description,
  action,
  as: Heading = "h3",
  className,
}: CardHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2 pb-6", className)}>
      <div className="min-w-0">
        <Heading className="text-h3 text-ink">{title}</Heading>
        {description ? <p className="mt-1 text-body-sm text-ink-muted">{description}</p> : null}
      </div>
      {action ? <div className="max-w-full shrink-0">{action}</div> : null}
    </div>
  );
}

export type CardBodyProps = HTMLAttributes<HTMLDivElement>;

export function CardBody({ className, ...props }: CardBodyProps) {
  return <div className={cn("min-w-0", className)} {...props} />;
}

export type CardFooterProps = HTMLAttributes<HTMLDivElement>;

export function CardFooter({ className, ...props }: CardFooterProps) {
  return (
    <div
      className={cn("mt-6 flex items-center justify-between gap-4 border-t border-hairline pt-4", className)}
      {...props}
    />
  );
}
