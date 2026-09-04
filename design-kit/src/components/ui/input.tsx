import type { InputHTMLAttributes } from "react";

import { Icon, type IconName } from "@/components/ui/icon";
import { controlClass, describedBy, Field } from "@/components/ui/field";
import { cn } from "@/lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  /** Leading decorative icon rendered inside the control. */
  icon?: IconName;
  /**
   * Short fixed text shown before the value, e.g. `+` on a dial code. It is
   * presentational — it never becomes part of the submitted value, so the
   * server does not have to strip it back off.
   */
  prefix?: string;
  invalid?: boolean;
}

/** Bare control. Prefer `TextField` unless you are composing a custom layout. */
export function Input({ id, icon, prefix, invalid, className, ...props }: InputProps) {
  return (
    <div className="relative min-w-0">
      {icon ? (
        <Icon
          name={icon}
          className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-muted"
        />
      ) : null}
      {prefix ? (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-body text-ink-muted"
        >
          {prefix}
        </span>
      ) : null}
      <input
        id={id}
        aria-invalid={invalid || undefined}
        className={cn(
          controlClass,
          "h-11",
          icon && "pl-[49px]",
          prefix && "pl-9",
          className,
        )}
        {...props}
      />
    </div>
  );
}

export interface TextFieldProps extends InputProps {
  label: string;
  hideLabel?: boolean;
  hint?: string;
  error?: string;
  fieldClassName?: string;
}

export function TextField({
  label,
  hideLabel,
  hint,
  error,
  required,
  fieldClassName,
  ...props
}: TextFieldProps) {
  return (
    <Field
      htmlFor={props.id}
      label={label}
      hideLabel={hideLabel}
      hint={hint}
      error={error}
      required={required}
      className={fieldClassName}
    >
      <Input
        {...props}
        required={required}
        invalid={Boolean(error)}
        aria-describedby={describedBy(props.id, { hint, error })}
      />
    </Field>
  );
}

/** Preset used by the console top bar and any list-page toolbar. */
export function SearchField({ label, className, ...props }: TextFieldProps) {
  return (
    <TextField
      {...props}
      label={label}
      hideLabel
      type="search"
      icon="search"
      className={cn("rounded-full", className)}
    />
  );
}
