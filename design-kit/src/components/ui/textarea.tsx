import type { TextareaHTMLAttributes } from "react";

import { controlClass, describedBy, Field } from "@/components/ui/field";
import { cn } from "@/lib/cn";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  id: string;
  invalid?: boolean;
}

export function Textarea({ id, invalid, className, rows = 4, ...props }: TextareaProps) {
  return (
    <textarea
      id={id}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(controlClass, "resize-y py-3", className)}
      {...props}
    />
  );
}

export interface TextareaFieldProps extends TextareaProps {
  label: string;
  hideLabel?: boolean;
  hint?: string;
  error?: string;
  fieldClassName?: string;
}

export function TextareaField({
  label,
  hideLabel,
  hint,
  error,
  required,
  fieldClassName,
  ...props
}: TextareaFieldProps) {
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
      <Textarea
        {...props}
        required={required}
        invalid={Boolean(error)}
        aria-describedby={describedBy(props.id, { hint, error })}
      />
    </Field>
  );
}
