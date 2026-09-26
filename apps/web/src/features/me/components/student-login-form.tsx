"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/input";
import { studentLogin } from "@/features/auth/server/actions";
import { IDLE } from "@/lib/form";

/**
 * Sign-in for a student.
 *
 * The one client component on the screen — for the pending state and for
 * binding field errors. The credentials themselves are only ever handled on
 * the server, and the actor is fixed by the action rather than posted from
 * here, so nothing this form sends can change which surface it signs into.
 */
export function StudentLoginForm() {
  const [state, action] = useActionState(studentLogin, IDLE);

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
        placeholder="stu-2026-0891@gurukulam.com"
        hint="The address on your welcome message, or your own email."
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

      {/* There is no self-service reset: password reset needs email, which is
          not integrated. Saying who to ask is better than a link that opens a
          form nobody receives. */}
      <p className="text-body-sm text-ink-muted">
        Forgotten your password? Ask the Gurukulam office to reset it — there is no self-service
        reset yet.
      </p>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="md" className="w-full" disabled={pending}>
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}
