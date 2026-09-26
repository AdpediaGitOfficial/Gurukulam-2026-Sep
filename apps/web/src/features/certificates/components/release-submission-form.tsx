"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { releaseSubmission } from "@/features/certificates/server/actions";
import { IDLE, type FormState } from "@/lib/form";

/**
 * The one irreversible step: approved rows become certificates here, and only
 * here (invariant 18).
 *
 * It asks first, because certificate numbers are issued on release and are
 * never reused — releasing a list with a wrong row in it means revoking a real
 * certificate afterwards, not undoing this.
 *
 * The API refuses while anything is still undecided and refuses a list where
 * nothing was approved. Both are reported here rather than hidden, so the
 * button stays honest about what it will do.
 */
export function ReleaseSubmissionForm({
  submissionId,
  approved,
  pending,
}: {
  submissionId: string;
  approved: number;
  pending: number;
}) {
  const action = releaseSubmission.bind(null, submissionId);
  const [state, submit] = useActionState<FormState, FormData>(action, IDLE);
  const [confirming, setConfirming] = useState(false);

  const blocked = pending > 0 || approved === 0;

  return (
    <Card>
      <CardHeader
        as="h2"
        title="Release the list"
        description="Approved names become certificates. This is the only way a certificate reaches a college."
      />

      {state.message === undefined ? null : (
        <Alert intent="danger" title="Nothing was released" className="mb-5">
          {state.message}
        </Alert>
      )}

      {pending > 0 ? (
        <p className="text-body-sm text-ink-muted">
          {pending} {pending === 1 ? "name is" : "names are"} still undecided. Every name needs an
          answer before the list can be released — a name left pending is a person who never finds
          out either way.
        </p>
      ) : approved === 0 ? (
        <p className="text-body-sm text-ink-muted">
          Nothing on this list was approved, so there is nothing to issue. The college needs to
          hear why, and the rejection reasons on each row are that answer.
        </p>
      ) : confirming ? (
        <form action={submit} className="flex flex-col gap-4">
          <p className="text-body-sm text-ink">
            This issues <strong>{approved}</strong> {approved === 1 ? "certificate" : "certificates"}.
            Numbers are generated now and are never reused — correcting a mistake afterwards means
            revoking a live certificate, not undoing this.
          </p>
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-body-sm text-ink-muted underline underline-offset-4"
            >
              Not yet
            </button>
            <Submit approved={approved} />
          </div>
        </form>
      ) : (
        <Button type="button" onClick={() => setConfirming(true)} disabled={blocked}>
          Release {approved} {approved === 1 ? "certificate" : "certificates"}
        </Button>
      )}
    </Card>
  );
}

function Submit({ approved }: { approved: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Issuing…" : `Yes, issue ${approved}`}
    </Button>
  );
}
