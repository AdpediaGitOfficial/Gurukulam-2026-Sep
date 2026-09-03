import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  hint?: string;
}

export function Checkbox({ id, label, hint, className, ...props }: CheckboxProps) {
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <input
        id={id}
        type="checkbox"
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-1 size-4 shrink-0 cursor-pointer rounded-[3px] border border-hairline-strong accent-brand"
        {...props}
      />
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
    </div>
  );
}
