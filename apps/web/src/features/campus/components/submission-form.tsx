"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { Batch } from "@gurukulam/contracts";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select";
import { TextareaField } from "@/components/ui/textarea";
import { submitForCertificates } from "@/features/campus/server/actions";
import { IDLE } from "@/lib/form";

/**
 * Putting names forward for certification.
 *
 * ── The college's half of invariant 18, and only that half ─────────────
 *
 * They say who they believe has finished. We check each name against its
 * eligibility, and RELEASE is what creates the certificates. A college that
 * could approve its own rows would be the flow with its only check removed — so
 * `decide` and `release` answer 403 for them, and neither appears here.
 *
 * ── Why a textarea and not a file upload ───────────────────────────────
 *
 * The console's import screen takes a CSV, and a TPO with thirty names has them
 * in an email rather than a spreadsheet. Pasting is the shortest path from that
 * email to this list; `Name, email` on a line is honoured because that is what
 * people paste.
 */
export function SubmissionForm({ batches }: { batches: Batch[] }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(submitForCertificates, IDLE);

  if (batches.length === 0) return null;

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Put names forward
      </Button>
    );
  }

  return (
    <form action={action} className="flex min-w-0 flex-col gap-5">
      {state.status === "error" && state.message !== undefined ? (
        <Alert intent="danger" title="That list was not sent">
          {state.message}
        </Alert>
      ) : null}

      <SelectField
        id="batchId"
        name="batchId"
        label="Which cohort have they finished?"
        placeholder="Choose a cohort"
        defaultValue=""
        options={batches.map((batch) => ({ value: batch.batchId, label: batch.name }))}
        required
        {...(state.fields?.["batchId"] === undefined ? {} : { error: state.fields["batchId"] })}
      />

      <TextareaField
        id="names"
        name="names"
        label="The students"
        rows={8}
        hint="One a line. Add an email after a comma if you have it — it helps us match the right record."
        placeholder={"Meera Nair, meera@example.edu\nKarthik Menon"}
        required
        {...(state.fields?.["names"] === undefined ? {} : { error: state.fields["names"] })}
      />

      <p className="text-body-sm text-ink-muted">
        We check each name against the cohort's attendance and marks before anything is issued. You
        will see the outcome on this screen.
      </p>

      <div className="flex flex-wrap gap-2">
        <Submit />
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Sending…" : "Send this list"}
    </Button>
  );
}
