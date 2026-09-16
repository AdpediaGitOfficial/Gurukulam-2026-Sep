"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { revokeCertificate } from "@/features/certificates/server/actions";
import { IDLE, type FormState } from "@/lib/form";

const controlClass =
  "min-h-24 w-full rounded-tile border border-hairline-strong bg-surface px-4 py-3 text-body text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none";

/**
 * Revocation, which is what a certificate has instead of a delete.
 *
 * It takes effect on the public verifier IMMEDIATELY — the verifier reads the
 * row, so there is no cached copy to expire and nothing to wait for. Somebody
 * holding the printed copy will find out by checking it, which is exactly why
 * the reason is required and stored: it is the answer to the question they
 * will then ask.
 *
 * Behind a confirm step rather than a bare button. It cannot be undone, and
 * the certificate number is never reissued.
 */
export function RevokeCertificateForm({
  certificateId,
  certificateNumber,
}: {
  certificateId: string;
  certificateNumber: string;
}) {
  const action = revokeCertificate.bind(null, certificateId);
  const [state, submit] = useActionState<FormState, FormData>(action, IDLE);
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader
        as="h2"
        title="Revoke"
        description="There is no delete. A certificate that was issued was issued — the correction is a revocation that says why."
      />

      {state.message === undefined ? null : (
        <Alert intent="danger" title="That certificate was not revoked" className="mb-5">
          {state.message}
        </Alert>
      )}

      {open ? (
        <form action={submit} className="flex flex-col gap-5">
          <Field
            htmlFor="reason"
            label="Why is it being revoked?"
            required
            hint="Shown to nobody automatically — but it is what you will be read back when someone asks why their certificate stopped verifying."
            {...(state.fields?.["reason"] === undefined ? {} : { error: state.fields["reason"] })}
          >
            <textarea
              id="reason"
              name="reason"
              rows={3}
              className={controlClass}
              placeholder="Issued against the wrong batch — replaced by GK-CERT-2026-00512."
            />
          </Field>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-body-sm text-ink-muted underline underline-offset-4"
            >
              Keep it
            </button>
            <Submit certificateNumber={certificateNumber} />
          </div>
        </form>
      ) : (
        <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
          Revoke this certificate
        </Button>
      )}
    </Card>
  );
}

function Submit({ certificateNumber }: { certificateNumber: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" disabled={pending}>
      {pending ? "Revoking…" : `Revoke ${certificateNumber}`}
    </Button>
  );
}
