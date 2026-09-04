"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/input";
import { IDLE, type FormState } from "@/lib/form";

/**
 * An action that takes something away, and asks why first.
 *
 * Revoking a portal login, suspending a student, suspending a trainer: all
 * three stop an account working, all three keep the reason on the record, and
 * all three should look the same doing it — an operator should not have to
 * learn three shapes for one idea.
 *
 * Two steps by design. The action signs someone out or withdraws them, so it
 * should not be reachable by mis-clicking a row, and asking for the reason is
 * what makes the second step worth having rather than a bare "are you sure".
 */
export function ConfirmWithReason({
  action,
  trigger,
  confirm,
  pending,
  description,
  reasonLabel = "Why",
  reasonHint = "Stored with the record and shown beside it.",
  reasonPlaceholder,
  required = false,
  subject,
  id,
}: {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  /** The resting label, e.g. "Suspend". */
  trigger: string;
  /** The label that actually does it, e.g. "Suspend account". */
  confirm: string;
  pending: string;
  /** What this will do, in the operator's terms. */
  description: ReactNode;
  reasonLabel?: string;
  reasonHint?: string;
  reasonPlaceholder?: string;
  required?: boolean;
  /** Who or what this acts on, for the accessible label. */
  subject: string;
  /** Unique on the page — two of these must not share an input id. */
  id: string;
}) {
  const [state, submit] = useActionState<FormState, FormData>(action, IDLE);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setConfirming(true)}
        aria-label={`${trigger} — ${subject}`}
      >
        {trigger}
      </Button>
    );
  }

  return (
    <form action={submit} className="flex w-full flex-col gap-3 border-t border-hairline pt-4">
      <p className="text-body-sm text-ink-muted">{description}</p>

      <TextField
        id={`reason-${id}`}
        name="reason"
        label={reasonLabel}
        hint={required ? `${reasonHint} Required.` : `${reasonHint} Optional.`}
        {...(required ? { required: true } : {})}
        {...(reasonPlaceholder === undefined ? {} : { placeholder: reasonPlaceholder })}
        {...(state.fields?.["reason"] === undefined
          ? {}
          : { error: state.fields["reason"] })}
      />

      {state.status === "error" && state.message !== undefined ? (
        <p className="text-body-sm text-danger">{state.message}</p>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
        <Submit label={confirm} pending={pending} subject={subject} />
      </div>
    </form>
  );
}

function Submit({
  label,
  pending,
  subject,
}: {
  label: string;
  pending: string;
  subject: string;
}) {
  const { pending: busy } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="danger"
      size="sm"
      disabled={busy}
      aria-label={`${label} — ${subject}`}
    >
      {busy ? pending : label}
    </Button>
  );
}

/**
 * The other half: putting it back.
 *
 * No reason, because restoring something needs no justification — and the
 * record's stored reason is cleared by the action anyway, since it described a
 * state that no longer applies.
 */
export function ConfirmAction({
  action,
  label,
  pending,
  subject,
}: {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  label: string;
  pending: string;
  subject: string;
}) {
  const [state, submit] = useActionState<FormState, FormData>(action, IDLE);

  return (
    <form action={submit} className="flex flex-col items-end gap-1">
      <Restore label={label} pending={pending} subject={subject} />
      {state.status === "error" && state.message !== undefined ? (
        <span className="text-caption text-danger">{state.message}</span>
      ) : null}
    </form>
  );
}

function Restore({
  label,
  pending,
  subject,
}: {
  label: string;
  pending: string;
  subject: string;
}) {
  const { pending: busy } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="secondary"
      size="sm"
      disabled={busy}
      aria-label={`${label} — ${subject}`}
    >
      {busy ? pending : label}
    </Button>
  );
}
