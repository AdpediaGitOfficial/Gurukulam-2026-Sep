"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { issueCertificate } from "@/features/certificates/server/actions";
import { IDLE, type FormState } from "@/lib/form";

const controlClass =
  "min-h-24 w-full rounded-tile border border-hairline-strong bg-surface px-4 py-3 text-body text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none";

/**
 * Signing off a certificate.
 *
 * Issuing is never automatic — an admin decides, which is why this is a form
 * and not a button that appears when a batch completes. When the API says
 * there are blockers the submit is CLOSED behind a deliberate override, and
 * the override needs a reason: it is recorded, and a year later somebody will
 * want to know who decided and why.
 *
 * The reason box appears only once the override is ticked, because a reason
 * field beside a clean eligibility panel invites an explanation nobody needs.
 */
export function IssueCertificateForm({
  studentId,
  batchId,
  eligible,
}: {
  studentId: string;
  batchId: string;
  eligible: boolean;
}) {
  const [state, submit] = useActionState<FormState, FormData>(issueCertificate, IDLE);
  const [override, setOverride] = useState(false);

  return (
    <Card>
      <CardHeader
        as="h2"
        title="Issue the certificate"
        description="The number is generated on save and never reused — not even if this is later revoked."
      />

      <form action={submit} className="flex flex-col gap-5">
        {state.message === undefined ? null : (
          <Alert intent="danger" title="That certificate was not issued">
            {state.message}
          </Alert>
        )}

        <input type="hidden" name="studentId" value={studentId} />
        <input type="hidden" name="batchId" value={batchId} />

        {eligible ? null : (
          <Alert intent="warning" title="This student is not clear to be issued">
            <label className="mt-1 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                name="overrideBlockers"
                checked={override}
                onChange={(event) => setOverride(event.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-brand"
              />
              <span>
                <span className="font-semibold text-ink">Issue despite the blockers above.</span>{" "}
                Course completion is an admin sign-off, so this is allowed — and recorded against
                your name.
              </span>
            </label>
          </Alert>
        )}

        {override ? (
          <Field
            htmlFor="overrideReason"
            label="Why are you issuing it anyway?"
            required
            hint="Read back a year from now by whoever is asking how this certificate came to exist."
            {...(state.fields?.["overrideReason"] === undefined
              ? {}
              : { error: state.fields["overrideReason"] })}
          >
            <textarea
              id="overrideReason"
              name="overrideReason"
              rows={3}
              className={controlClass}
              placeholder="Attendance was taken on paper for this cohort and has been checked against the register."
            />
          </Field>
        ) : null}

        <div className="flex justify-end">
          <Submit disabled={!eligible && !override} />
        </div>
      </form>
    </Card>
  );
}

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? "Issuing…" : "Issue certificate"}
    </Button>
  );
}
