import type { SelectHTMLAttributes } from "react";

import { controlClass, describedBy, Field } from "@/components/ui/field";
import { cn } from "@/lib/cn";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  id: string;
  options: readonly SelectOption[];
  /** Rendered as a disabled first option when there is no value yet. */
  placeholder?: string;
  invalid?: boolean;
}

export function Select({ id, options, placeholder, invalid, className, ...props }: SelectProps) {
  return (
    <select
      id={id}
      aria-invalid={invalid || undefined}
      // Native appearance is kept deliberately: the design ships no chevron
      // asset, and the platform control is accessible on every device.
      className={cn(controlClass, "h-11 cursor-pointer pr-3", className)}
      {...props}
    >
      {placeholder ? (
        <option value="" disabled>
          {placeholder}
        </option>
      ) : null}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export interface SelectFieldProps extends SelectProps {
  label: string;
  hideLabel?: boolean;
  hint?: string;
  error?: string;
  fieldClassName?: string;
}

export function SelectField({
  label,
  hideLabel,
  hint,
  error,
  required,
  fieldClassName,
  ...props
}: SelectFieldProps) {
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
      <Select
        {...props}
        required={required}
        invalid={Boolean(error)}
        aria-describedby={describedBy(props.id, { hint, error })}
      />
    </Field>
  );
}
