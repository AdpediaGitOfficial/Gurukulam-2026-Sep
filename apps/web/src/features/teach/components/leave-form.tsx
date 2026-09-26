"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/input";
import { TextareaField } from "@/components/ui/textarea";
import { declareLeave } from "@/features/teach/server/actions";
import { IDLE, type FormState } from "@/lib/form";

/**
 * Blocking time.
 *
 * ── Why it opens closed ────────────────────────────────────────────────
 *
 * The screen above it is read far more often than it is written — a trainer
 * opens their diary to check what is coming, not to book leave. Three inputs
 * permanently open under that answer is three inputs of noise around it.
 *
 * ── Why the collision is the API's to refuse ───────────────────────────
 *
 * Leave covering a session already confirmed is a contradiction, and only the
 * server knows the whole diary. Checking here as well would be a second copy
 * of the rule that could pass while the real one refuses.
 */
export function LeaveForm() {
  const [open, setOpen] = useState(false);
  const [state, submit] = useActionState<FormState, FormData>(declareLeave, IDLE);

  if (!open) {
    return (
      <div className="flex">
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Block some time
        </Button>
      </div>
    );
  }

  return (
    <form action={submit} className="flex flex-col gap-5">
      {state.status === "error" && state.message !== undefined ? (
        <Alert intent="danger" title="That time was not blocked">
          {state.message}
        </Alert>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          id="startsAt"
          name="startsAt"
          label="From"
          type="date"
          required
          {...(state.fields?.["startsAt"] === undefined ? {} : { error: state.fields["startsAt"] })}
        />
        <TextField
          id="endsAt"
          name="endsAt"
          label="To"
          type="date"
          required
          hint="The last day you are away."
          {...(state.fields?.["endsAt"] === undefined ? {} : { error: state.fields["endsAt"] })}
        />
      </div>

      <TextareaField
        id="reason"
        name="reason"
        label="Why (optional)"
        rows={2}
        hint="The office sees this when they staff a batch."
      />

      <div className="flex items-center justify-end gap-3 border-t border-hairline pt-5">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Submit />
      </div>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Blocking…" : "Block it"}
    </Button>
  );
}
