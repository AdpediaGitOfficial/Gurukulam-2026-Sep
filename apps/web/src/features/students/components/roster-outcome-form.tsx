"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { StudentBatch } from "@gurukulam/contracts";

import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { setRosterOutcome } from "@/features/students/server/actions";
import { IDLE, type FormState } from "@/lib/form";

/**
 * How this student's time on this batch ended.
 *
 * ── Why it opens closed ─────────────────────────────────────────────────
 *
 * The resting state is the OUTCOME, not the controls: a roster is read far
 * more often than it is changed, and three radio buttons on every row of a
 * long enrolment list is noise around the one word somebody came to read.
 * "Record" opens it.
 *
 * ── Why leaving needs a reason and finishing does not ───────────────────
 *
 * "Completed" is self-explanatory. "Left" is the beginning of a question, and
 * a drop-out rate nobody can break down by reason is a number that gets
 * reported and never acted on. The API refuses an exit without one; this asks
 * for it before the refusal, so the operator is never told off after the fact.
 */
export function RosterOutcomeForm({ studentId, batch }: { studentId: string; batch: StudentBatch }) {
  const action = setRosterOutcome.bind(null, studentId, batch.batchId);
  const [state, submit] = useActionState<FormState, FormData>(action, IDLE);
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState(
    batch.completedAt !== null ? "COMPLETED" : batch.isActive ? "ACTIVE" : "EXITED",
  );

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <Outcome batch={batch} />
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
          Record
        </Button>
      </div>
    );
  }

  return (
    <form action={submit} className="flex min-w-64 flex-col gap-3">
      {state.message === undefined ? null : (
        <p className="text-caption text-danger">{state.message}</p>
      )}

      <div className="flex flex-wrap gap-3">
        {(
          [
            ["ACTIVE", "Still on it"],
            ["COMPLETED", "Completed"],
            ["EXITED", "Left"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex cursor-pointer items-center gap-1.5 text-body-sm">
            <input
              type="radio"
              name="outcome"
              value={value}
              checked={outcome === value}
              onChange={() => setOutcome(value)}
              className="size-4 accent-brand"
            />
            {label}
          </label>
        ))}
      </div>

      {outcome === "EXITED" ? (
        <div className="flex flex-col gap-1">
          <input
            name="reason"
            defaultValue={batch.exitReason ?? ""}
            placeholder="Why they left — moved city, fees, changed course…"
            className="h-11 w-full rounded-tile border border-hairline-strong bg-surface px-3 text-body-sm text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none"
          />
          {state.fields?.["reason"] === undefined ? null : (
            <p className="text-caption text-danger">{state.fields["reason"]}</p>
          )}
        </div>
      ) : (
        // The field is still submitted when it is not shown, so switching back
        // to "Left" after a failed save does not silently lose what was typed.
        <input type="hidden" name="reason" value="" />
      )}

      <div className="flex gap-2">
        <Save />
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** The resting state: what happened, in one pill. */
function Outcome({ batch }: { batch: StudentBatch }) {
  if (batch.completedAt !== null) {
    return (
      <StatusPill intent="success">
        completed {new Date(batch.completedAt).toLocaleDateString("en-IN")}
      </StatusPill>
    );
  }
  if (!batch.isActive) {
    return (
      <span className="flex flex-col items-end gap-0.5">
        <StatusPill intent="danger">left</StatusPill>
        {batch.exitReason === null ? null : (
          <span className="max-w-48 truncate text-caption text-ink-subtle">{batch.exitReason}</span>
        )}
      </span>
    );
  }
  return <StatusPill intent="neutral">on the roster</StatusPill>;
}

function Save() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}
