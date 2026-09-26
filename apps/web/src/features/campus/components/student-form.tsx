"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/input";
import { addStudent } from "@/features/campus/server/actions";
import { IDLE } from "@/lib/form";

/**
 * Adding one of their own students.
 *
 * ── Why there is no college field ──────────────────────────────────────
 *
 * The API forces it from the principal (`principal.collegeScope ?? input`), and
 * that is what makes invariant 2 hold for institutional intake: a student
 * created here carries this college, so they can only ever join a batch carrying
 * the same one. A form field would be a decision the server overrules.
 *
 * ── Why no fee fields ──────────────────────────────────────────────────
 *
 * Invariant 3. A college student has no individual ledger — the institution is
 * billed under its contract — so there is no price to negotiate here and no
 * advance to collect.
 */
export function StudentForm() {
  const [state, action] = useActionState(addStudent, IDLE);

  return (
    <form action={action} className="flex flex-col gap-5">
      {state.status === "error" && state.message !== undefined ? (
        <Alert intent="danger" title="That student was not added">
          {state.message}
        </Alert>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          id="firstName"
          name="firstName"
          label="First name"
          autoComplete="off"
          required
          {...(state.fields?.["firstName"] === undefined
            ? {}
            : { error: state.fields["firstName"] })}
        />
        <TextField
          id="lastName"
          name="lastName"
          label="Last name"
          autoComplete="off"
          {...(state.fields?.["lastName"] === undefined ? {} : { error: state.fields["lastName"] })}
        />
      </div>

      <TextField
        id="email"
        name="email"
        label="Email"
        type="email"
        autoComplete="off"
        hint="Their own address — this is where their sign-in details go."
        required
        {...(state.fields?.["email"] === undefined ? {} : { error: state.fields["email"] })}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          id="phone"
          name="phone"
          label="Phone"
          type="tel"
          autoComplete="off"
          {...(state.fields?.["phone"] === undefined ? {} : { error: state.fields["phone"] })}
        />
        <TextField
          id="dateOfBirth"
          name="dateOfBirth"
          label="Date of birth"
          type="date"
          {...(state.fields?.["dateOfBirth"] === undefined
            ? {}
            : { error: state.fields["dateOfBirth"] })}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          id="discipline"
          name="discipline"
          label="Branch or department"
          placeholder="Computer Science"
          {...(state.fields?.["discipline"] === undefined
            ? {}
            : { error: state.fields["discipline"] })}
        />
        <TextField
          id="passoutYear"
          name="passoutYear"
          label="Graduating year"
          type="number"
          inputMode="numeric"
          min={1950}
          max={2100}
          {...(state.fields?.["passoutYear"] === undefined
            ? {}
            : { error: state.fields["passoutYear"] })}
        />
      </div>

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? "Adding…" : "Add this student"}
    </Button>
  );
}
