"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { createSubmission } from "@/features/certificates/server/actions";
import { IDLE, type FormState } from "@/lib/form";

const controlClass =
  "h-12 w-full appearance-none rounded-tile border border-hairline-strong bg-surface px-4 text-body text-ink focus:border-brand focus:outline-none";

export interface BatchOption {
  batchId: string;
  batchCode: string;
  name: string;
}

/**
 * Filing a college's list of names.
 *
 * Normally the college does this from its own portal; an admin files one on
 * their behalf when it arrives by email, which is most of the time today.
 *
 * One name per line — `Name, email, reference` — because that is what comes
 * out of a college secretary's spreadsheet, and a line with just a name is a
 * legitimate thing to send. The email and reference are not required to make
 * the claim; they exist to make MATCHING it to a student easy at review, which
 * is the step that decides whether a certificate gets issued.
 */
export function SubmissionForm({
  collegeId,
  batches,
}: {
  collegeId: string;
  batches: readonly BatchOption[];
}) {
  const action = createSubmission.bind(null, collegeId);
  const [state, submit] = useActionState<FormState, FormData>(action, IDLE);

  if (batches.length === 0) {
    return (
      <Alert intent="warning" title="This college has no trainings yet">
        A certificate list names the delivery it is for, so there is nothing to file against until
        this college has a batch.
      </Alert>
    );
  }

  return (
    <Card>
      <form action={submit} className="flex flex-col gap-6">
        {state.message === undefined ? null : (
          <Alert intent="danger" title="That list was not filed">
            {state.message}
          </Alert>
        )}

        <Field
          htmlFor="batchId"
          label="Which training"
          required
          hint="Only this college's own batches — a dedicated batch never carries retail students."
          {...(state.fields?.["batchId"] === undefined ? {} : { error: state.fields["batchId"] })}
        >
          {/* The select draws its own chevron rather than the native arrow,
              which cannot be positioned — the house rule for every select. */}
          <div className="relative">
            <select id="batchId" name="batchId" className={controlClass} defaultValue="">
              <option value="" disabled>
                Choose a training…
              </option>
              {batches.map((batch) => (
                <option key={batch.batchId} value={batch.batchId}>
                  {batch.name} · {batch.batchCode}
                </option>
              ))}
            </select>
            <span
              aria-hidden
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink-muted"
            >
              ▾
            </span>
          </div>
        </Field>

        <Field
          htmlFor="names"
          label="The names"
          required
          hint="One per line. Name, then optionally an email and a student reference, separated by commas."
          {...(state.fields?.["names"] === undefined ? {} : { error: state.fields["names"] })}
        >
          <textarea
            id="names"
            name="names"
            rows={12}
            className="w-full rounded-tile border border-hairline-strong bg-surface px-4 py-3 font-mono text-caption text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none"
            placeholder={"Aarti Rao, aarti.rao@example.com, STU-2026-0891\nImran Sheikh, imran@example.com\nPriya Nair"}
          />
        </Field>

        <div className="flex items-center justify-end gap-3 border-t border-hairline pt-5">
          <p className="mr-auto text-body-sm text-ink-muted">
            Nothing here becomes a certificate. Each name is decided on the next screen.
          </p>
          <Submit />
        </div>
      </form>
    </Card>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Filing…" : "File the list"}
    </Button>
  );
}
