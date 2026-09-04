"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { revokeAccess } from "@/features/colleges/server/actions";
import { IDLE, type FormState } from "@/lib/form";

/**
 * Revoking one account.
 *
 * No reason field, deliberately: the endpoint accepts one and discards it —
 * nothing stores it — and a box whose contents are thrown away is worse than
 * no box. When there is somewhere to put it, the field belongs here.
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

  return (
    <form action={submit} className="flex flex-col items-end gap-1">
      <Submit name={name} />
      {state.status === "error" && state.message !== undefined ? (
        <span className="text-caption text-danger">{state.message}</span>
      ) : null}
    </form>
  );
}

function Submit({ name }: { name: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="ghost"
      size="sm"
      disabled={pending}
      aria-label={`Revoke portal access for ${name}`}
    >
      {pending ? "Revoking…" : "Revoke"}
    </Button>
  );
}
