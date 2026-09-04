"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/input";
import { login } from "@/features/auth/server/actions";
import { IDLE } from "@/lib/form";

export interface LoginFormProps {
  /** Where to land after signing in. Already validated by the page. */
  next: string;
}

/**
 * The one client component on this screen. It exists for the pending state and
 * for binding field errors — the credentials themselves are only ever handled
 * on the server.
 */
export function LoginForm({ next }: LoginFormProps) {
  const [state, action] = useActionState(login, IDLE);

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />

      {state.status === "error" && state.message !== undefined ? (
        <Alert intent="danger" title="Could not sign you in">
          {state.message}
        </Alert>
      ) : null}

      <TextField
        id="email"
        name="email"
        label="Email address"
        type="email"
        autoComplete="username"
        placeholder="you@gurukulam.com"
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

/**
 * Split out because `useFormStatus` reports the status of the form it is
 * rendered inside — read from the component that owns the form it would always
 * be false.
 */
function Submit() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="mt-1 w-full">
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}
