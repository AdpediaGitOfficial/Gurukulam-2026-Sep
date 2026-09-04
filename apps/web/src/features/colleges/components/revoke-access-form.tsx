"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/input";
import { revokeAccess } from "@/features/colleges/server/actions";
import { IDLE, type FormState } from "@/lib/form";

/**
 * Revoking one account.
 *
 * Two steps rather than one: revoking signs someone out immediately and clears
 * their password, so it is not a thing to do by mis-clicking a row. Asking for
 * the reason is what makes the second step worth having — the answer is stored
 * and shown next to the account afterwards.
 */
export function RevokeAccessForm({
  collegeId,
  collegeUserId,
  name,
}: {
  collegeId: string;
  collegeUserId: string;
  name: string;
}) {
  const [state, submit] = useActionState<FormState, FormData>(
    revokeAccess.bind(null, collegeId, collegeUserId),
    IDLE,
  );
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setConfirming(true)}
        aria-label={`Revoke portal access for ${name}`}
      >
        Revoke
      </Button>
    );
  }

  return (
    <form action={submit} className="flex w-full flex-col gap-3 border-t border-hairline pt-4">
      <p className="text-body-sm text-ink-muted">
        Revoking signs {name} out immediately and clears their password. Restoring access later
        issues a new one — the old password does not come back.
      </p>
      <TextField
        id={`revoke-reason-${collegeUserId}`}
        name="reason"
        label="Why"
        placeholder="Left the college"
        hint="Stored with the account and shown beside it. Optional."
      />
      {state.status === "error" && state.message !== undefined ? (
        <p className="text-body-sm text-danger">{state.message}</p>
      ) : null}
      <div className="flex items-center justify-end gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
        <Submit name={name} />
      </div>
    </form>
  );
}

function Submit({ name }: { name: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="danger"
      size="sm"
      disabled={pending}
      aria-label={`Confirm revoking portal access for ${name}`}
    >
      {pending ? "Revoking…" : "Revoke access"}
    </Button>
  );
}
