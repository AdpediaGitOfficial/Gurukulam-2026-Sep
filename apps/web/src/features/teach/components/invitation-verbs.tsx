"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextareaField } from "@/components/ui/textarea";
import { respondToInvitation } from "@/features/teach/server/actions";
import { IDLE, type FormState } from "@/lib/form";

/**
 * Accept, or decline with a reason.
 *
 * ── Why declining asks for a reason and accepting does not ─────────────
 *
 * A decline leaves the cohort unstaffed and somebody has to find another
 * trainer today. "Not available that fortnight" and "I am not approved for
 * that course" send them in different directions, and the column exists to
 * carry the difference. Accepting needs no explanation — the batch is staffed
 * and the schedule speaks for itself.
 */
export function InvitationVerbs({
  batchId,
  batchCode,
  disabled,
}: {
  batchId: string;
  batchCode: string;
  /** A suspended trainer reads their invitations and cannot answer them. */
  disabled: boolean;
}) {
  const [declining, setDeclining] = useState(false);
  const action = useMemo(() => respondToInvitation.bind(null, batchId), [batchId]);
  const [state, submit] = useActionState<FormState, FormData>(action, IDLE);

  if (disabled) {
    return (
      <p className="text-body-sm text-ink-subtle">
        Your account is suspended, so this is not yours to answer yet. Speak to the office.
      </p>
    );
  }

  return (
    <form action={submit} className="flex min-w-0 flex-col gap-3 border-t border-hairline pt-4">
      {state.status === "error" && state.message !== undefined ? (
        <Alert intent="danger" title="That answer was not recorded">
          {state.message}
        </Alert>
      ) : null}

      {declining ? (
        <TextareaField
          id={`reason-${batchId}`}
          name="reason"
          label={`Why are you turning down ${batchCode}?`}
          rows={3}
          required
          hint="The office needs to know whether to look for dates or for somebody else."
          {...(state.fields?.["reason"] === undefined ? {} : { error: state.fields["reason"] })}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {declining ? (
          <>
            <Submit decision="DECLINE" label="Send the decline" pending="Sending…" />
            <Button type="button" variant="ghost" size="sm" onClick={() => setDeclining(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Submit decision="CONFIRM" label="Accept this batch" pending="Accepting…" />
            <Button type="button" variant="ghost" size="sm" onClick={() => setDeclining(true)}>
              Turn it down
            </Button>
          </>
        )}
      </div>
    </form>
  );
}

function Submit({
  decision,
  label,
  pending: pendingLabel,
}: {
  decision: "CONFIRM" | "DECLINE";
  label: string;
  pending: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      name="decision"
      value={decision}
      variant={decision === "CONFIRM" ? "primary" : "secondary"}
      disabled={pending}
    >
      {pending ? pendingLabel : label}
    </Button>
  );
}
