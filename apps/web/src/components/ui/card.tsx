import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

const cardVariants = cva("rounded-card", {
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
      {action ? <div className="shrink-0">{action}</div> : null}
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
