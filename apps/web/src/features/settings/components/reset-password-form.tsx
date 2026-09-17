"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AdminCredential } from "@/features/settings/components/admin-credential";
import { resetAdministratorPassword } from "@/features/settings/server/actions";
import type { AdminCredentialState } from "@/features/settings/types";
import { IDLE } from "@/lib/form";

/**
 * Issuing a new password for an operator who has lost theirs.
 *
 * Destructive in the way that matters: the old password stops working the
 * moment this returns, so it is two steps and the first one says so. The new
 * one is shown once — there is no mail integration to send it.
 */
export function ResetPasswordForm({
  adminUserId,
  name,
}: {
  adminUserId: string;
  name: string;
}) {
  const [state, submit] = useActionState<AdminCredentialState, FormData>(
    resetAdministratorPassword.bind(null, adminUserId),
    IDLE,
  );

  if (state.issued !== undefined) {
    return (
      <AdminCredential
        issued={state.issued}
        action={
          <span className="text-body-sm text-ink-muted">
            Pass it to {name} — their previous password no longer works.
          </span>
        }
      />
    );
  }

  return (
    <Card className="flex flex-col gap-4">
      {state.status === "error" && state.message !== undefined ? (
        <Alert intent="danger" title="Could not reset the password">
          {state.message}
        </Alert>
      ) : null}

      <div>
        <h2 className="text-h3 text-ink">Reset password</h2>
        <p className="mt-1 max-w-2xl text-body-sm text-ink-muted">
          Issues a new temporary password and invalidates the one {name} is using now. They will be
          signed out and asked to set a new one. It is shown here once — nothing emails it.
        </p>
      </div>

      <form action={submit} className="flex justify-end">
        <Submit name={name} />
      </form>
    </Card>
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
      aria-label={`Reset the password for ${name}`}
    >
      {pending ? "Issuing…" : "Reset password"}
    </Button>
  );
}
