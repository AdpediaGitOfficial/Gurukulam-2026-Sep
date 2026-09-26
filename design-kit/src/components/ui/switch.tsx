import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  id: string;
  label: string;
  hint?: string;
}

/**
 * A checkbox styled as a toggle. Track and knob are siblings of the input so
 * the visual state is driven by `peer-checked` alone — no JS, and it works in a
 * Server Component and inside an uncontrolled form.
 */
export function Switch({ id, label, hint, className, ...props }: SwitchProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-body-sm text-ink">
          {label}
        </label>
        {hint ? (
          <p id={`${id}-hint`} className="text-caption text-ink-muted">
            {hint}
          </p>
        ) : null}
      </div>

      <span className="relative block h-6 w-11 shrink-0">
        <input
          id={id}
          type="checkbox"
          role="switch"
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
          {...props}
        />
        {/* The unchecked track is only 1.22:1 against the card it sits on, so
            an inset hairline gives the control a 3:1 boundary (WCAG 1.4.11).
            The checked track is 6.4:1 on its own and needs no ring. */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-neutral ring-1 ring-hairline-strong transition-colors ring-inset peer-checked:bg-brand peer-checked:ring-0 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand"
        />
        <span
          aria-hidden
          className="absolute top-0.5 left-0.5 size-5 rounded-full bg-surface shadow-raised transition-transform peer-checked:translate-x-5"
        />
      </span>
    </div>
  );
}
