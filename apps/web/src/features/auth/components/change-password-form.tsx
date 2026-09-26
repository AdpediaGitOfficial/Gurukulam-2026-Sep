"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/input";
import { changePassword } from "@/features/auth/server/actions";
import { IDLE, type FormState } from "@/lib/form";

export function ChangePasswordForm({ required }: { required: boolean }) {
  const [state, submit] = useActionState<FormState, FormData>(changePassword, IDLE);
  const field = (key: string) => state.fields?.[key];

  return (
    <form action={submit} className="flex flex-col gap-5">
      {state.status === "error" && state.message !== undefined ? (
        <Alert intent="danger" title="Could not change your password">
          {state.message}
        </Alert>
      ) : null}

      <TextField
        id="currentPassword"
        name="currentPassword"
        label={required ? "The password you were given" : "Current password"}
        type="password"
        autoComplete="current-password"
        required
        {...(field("currentPassword") === undefined ? {} : { error: field("currentPassword") })}
      />

      <TextField
        id="newPassword"
        name="newPassword"
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 12 characters, with an uppercase letter, a lowercase letter and a digit."
        {...(field("newPassword") === undefined ? {} : { error: field("newPassword") })}
      />

      <TextField
        id="confirmPassword"
        name="confirmPassword"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        required
        {...(field("confirmPassword") === undefined ? {} : { error: field("confirmPassword") })}
      />

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="self-end">
      {pending ? "Saving…" : "Change password"}
    </Button>
  );
}
