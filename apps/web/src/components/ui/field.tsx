import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Shared surface styling for text-like controls. Exported so every control
 * (input, select, textarea) resolves to the same box.
 */
/**
 * Form fields are rounded rectangles; only search is a pill (see `SearchField`).
 * The distinction is deliberate — a pill reads as "type to filter", a rectangle
 * as "this is a value you are editing".
 */
export const controlClass =
  "w-full rounded-tile border border-hairline-strong bg-surface px-4 text-body text-ink transition-colors placeholder:text-ink-subtle focus:border-brand focus:outline-none disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-subtle aria-[invalid=true]:border-danger";

export interface FieldProps {
  /** Must match the `id` of the control rendered as `children`. */
  htmlFor: string;
  label: string;
  /** Renders the label to assistive tech only. */
  hideLabel?: boolean;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Label + hint + error scaffolding around a control.
 *
 * Ids are explicit rather than generated, because these render on the server
 * where `useId` is unavailable. Wire `htmlFor`, the control's `id`, and its
 * `aria-describedby` to the same base string.
 */
export function Field({
  htmlFor,
  label,
  hideLabel = false,
  hint,
  error,
  required = false,
  children,
  className,
}: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className={cn("text-body-sm font-medium text-ink", hideLabel && "sr-only")}
      >
        {label}
        {required ? (
          <span aria-hidden className="ml-0.5 text-danger">
            *
          </span>
        ) : null}
      </label>

      {children}

      {hint && !error ? (
        <p id={`${htmlFor}-hint`} className="text-caption text-ink-muted">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p id={`${htmlFor}-error`} className="text-caption text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Builds the `aria-describedby` value matching what `Field` renders. */
export function describedBy(id: string, options: { hint?: string; error?: string }): string | undefined {
  if (options.error) return `${id}-error`;
  if (options.hint) return `${id}-hint`;
  return undefined;
}
