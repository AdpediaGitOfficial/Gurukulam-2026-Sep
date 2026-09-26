"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/input";
import { collegeLogin } from "@/features/auth/server/actions";
import { IDLE } from "@/lib/form";

/**
 * Sign-in for a college.
 *
 * The one client component on the screen — for the pending state and to bind
 * field errors. The actor is fixed by the server action, so nothing this form
 * sends can change which surface it opens.
 *
 * The hint under the login field is load-bearing rather than decorative: the
 * identity is derived from the college's code, so it is never the address a POC
 * would guess, and a portal whose first screen cannot be got past is a portal
 * nobody reports because nobody reached it.
 */
export function CollegeLoginForm() {
  const [state, action] = useActionState(collegeLogin, IDLE);

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
        placeholder="snc@gurukulam.com"
        hint="Issued by Gurukulam, and built from your college's code — not your own work address."
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
