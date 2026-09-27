import type { ReactNode } from "react";

import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

const TONE_WELL = {
  accent: "bg-accent-glow text-on-accent",
  brand: "bg-brand/15 text-brand",
  neutral: "bg-surface-muted text-ink-muted",
} as const;

export interface FormSectionProps {
  title: string;
  /** Glyph in the leading well. */
  icon: IconName;
  tone?: keyof typeof TONE_WELL;
  /** Optional line under the heading explaining what the group is for. */
  description?: string;
  children: ReactNode;
  className?: string;
}

/**
 * A titled group of fields inside a form card, led by a coloured icon well.
 *
 * Long forms are much easier to scan when the fields are grouped and each
 * group is named. Use `DrawerSection` instead inside a `Drawer`, where the
 * narrower column has no room for the icon well.
 */
export function FormSection({
  title,
  icon,
  tone = "accent",
  description,
  children,
  className,
}: FormSectionProps) {
  return (
    <section className={cn("flex flex-col gap-6", className)}>
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full",
            TONE_WELL[tone],
          )}
        >
          <Icon name={icon} />
        </span>
        <div className="min-w-0">
          <h2 className="text-h2 text-ink">{title}</h2>
          {description ? <p className="text-body-sm text-ink-muted">{description}</p> : null}
        </div>
      </div>

      {children}
    </section>
  );
}
