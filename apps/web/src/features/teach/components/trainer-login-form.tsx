"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/input";
import { trainerLogin } from "@/features/auth/server/actions";
import { IDLE } from "@/lib/form";

/**
 * Sign-in for a trainer.
 *
 * The one client component on the screen — for the pending state and to bind
 * field errors. The credentials are only ever handled on the server, and the
 * actor is fixed by the action, so nothing this form sends can change which
 * surface it opens.
 */
export function TrainerLoginForm() {
  const [state, action] = useActionState(trainerLogin, IDLE);

  return (
    <form action={action} className="flex flex-col gap-5">
      {state.status === "error" && state.message !== undefined ? (
        <Alert intent="danger" title="Could not sign you in">
          {state.message}
        </Alert>
      ) : null}

      <TextField
        id="email"
        name="email"
        label="Your login"
        type="email"
        autoComplete="username"
        placeholder="trn-0042@gurukulam.com"
        hint="The address on your welcome message."
        required
        {...(state.fields?.["email"] === undefined ? {} : { error: state.fields["email"] })}
      />

      <TextField
        id="password"
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        {...(state.fields?.["password"] === undefined ? {} : { error: state.fields["password"] })}
      />

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}
