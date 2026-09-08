import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  hint?: string;
  /**
   * Keep the label for screen readers but not on screen.
   *
   * For a grid where the column heading already says what the box means, and
   * repeating it in every cell would be noise to read and noise to look at.
   * The label still exists — a checkbox with no accessible name is unusable
   * by anyone not looking at the column.
   */
  hideLabel?: boolean;
}

export function Checkbox({ id, label, hint, hideLabel, className, ...props }: CheckboxProps) {
  return (
    <div
      className={cn(
        hideLabel ? "flex items-center justify-center" : "flex items-start gap-3",
        className,
      )}
    >
      <input
        id={id}
        type="checkbox"
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={cn(
          "size-4 shrink-0 cursor-pointer rounded-[3px] border border-hairline-strong accent-brand",
          !hideLabel && "mt-1",
        )}
        {...props}
      />
      <div className={cn("min-w-0", hideLabel && "sr-only")}>
        <label htmlFor={id} className="cursor-pointer text-body-sm text-ink">
          {label}
        </label>
        {hint ? (
          <p id={`${id}-hint`} className="text-caption text-ink-muted">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
