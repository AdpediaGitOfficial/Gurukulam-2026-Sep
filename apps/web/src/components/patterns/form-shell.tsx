"use client";

import { createContext, useActionState, useContext, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField, type TextFieldProps } from "@/components/ui/input";
import { SelectField, type SelectFieldProps } from "@/components/ui/select";
import { TextareaField, type TextareaFieldProps } from "@/components/ui/textarea";
import { IDLE, type FormState } from "@/lib/form";
import { cn } from "@/lib/cn";

/**
 * Field errors, shared with every input in the form.
 *
 * Passing them down by prop through three levels of layout is how a form ends
 * up binding half its errors and silently dropping the rest — the ones on the
 * fields nobody remembered to thread.
 */
const FieldErrors = createContext<Record<string, string>>({});

/** The message for one input, keyed by its `name`. */
export function useFieldError(name: string): string | undefined {
  return useContext(FieldErrors)[name];
}

export interface FormShellProps {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  /** Shown in the danger alert's heading when the action fails. */
  errorTitle: string;
  submitLabel: string;
  pendingLabel?: string;
  /** Rendered beside the submit button — usually a Cancel link. */
  secondary?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * The scaffolding every entity form shares: pending state, the failure
 * message, field-error distribution, and one submit button that cannot be
 * pressed twice.
 *
 * Actions return field-keyed errors whose keys are the inputs' own names, so a
 * form binds them by naming its fields after the contract rather than mapping
 * anything.
 */
export function FormShell({
  action,
  errorTitle,
  submitLabel,
  pendingLabel,
  secondary,
  children,
  className,
}: FormShellProps) {
  const [state, submit] = useActionState<FormState, FormData>(action, IDLE);

  return (
    <FieldErrors.Provider value={state.fields ?? {}}>
      <form action={submit} className={cn("flex flex-col gap-6", className)}>
        {state.status === "error" && state.message !== undefined ? (
          <Alert intent="danger" title={errorTitle}>
            {state.message}
          </Alert>
        ) : null}

        {children}

        <div className="flex items-center justify-end gap-3 border-t border-hairline pt-6">
          {secondary}
          <Submit label={submitLabel} pendingLabel={pendingLabel ?? "Saving…"} />
        </div>
      </form>
    </FieldErrors.Provider>
  );
}

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

/** A grid of fields under a heading. Two columns, full-width where it matters. */
export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-h3 text-ink">{title}</h2>
        {description === undefined ? null : (
          <p className="mt-1 text-body-sm text-ink-muted">{description}</p>
        )}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">{children}</div>
    </section>
  );
}

/*
 * Bound fields.
 *
 * Each reads its own error from the form's context by `name`, so a form lists
 * its fields and nothing threads messages down by hand. Reading the error
 * inside the field is also what keeps the hook call unconditional — a helper
 * that returned the error to a caller would have to be called from a component
 * body every time, which is a rule waiting to be broken.
 */

export function FormText({
  name,
  ...props
}: Omit<TextFieldProps, "error" | "id" | "name"> & { name: string; id?: string }) {
  const error = useFieldError(name);
  return (
    <TextField
      {...props}
      id={props.id ?? name}
      name={name}
      {...(error === undefined ? {} : { error })}
    />
  );
}

export function FormSelect({
  name,
  ...props
}: Omit<SelectFieldProps, "error" | "id" | "name"> & { name: string; id?: string }) {
  const error = useFieldError(name);
  return (
    <SelectField
      {...props}
      id={props.id ?? name}
      name={name}
      {...(error === undefined ? {} : { error })}
    />
  );
}

export function FormTextarea({
  name,
  ...props
}: Omit<TextareaFieldProps, "error" | "id" | "name"> & { name: string; id?: string }) {
  const error = useFieldError(name);
  return (
    <TextareaField
      {...props}
      id={props.id ?? name}
      name={name}
      {...(error === undefined ? {} : { error })}
    />
  );
}

/** Spans both columns of a `FormSection`'s grid. */
export function FullWidth({ children }: { children: ReactNode }) {
  return <div className="sm:col-span-2">{children}</div>;
}
