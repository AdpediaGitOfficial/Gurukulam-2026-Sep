"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { deleteRecord, type DeleteTarget } from "@/server/delete";
import { IDLE, type FormState } from "@/lib/form";

/**
 * The delete verb, on the row.
 *
 * One component for every module, because twelve hand-written delete buttons
 * would be twelve chances to forget the confirm step or swallow the refusal.
 *
 * Three things it is careful about:
 *
 *   · **It confirms in place** rather than behind a dialog. The row already
 *     names the record; a modal that repeats the name back is ceremony, and
 *     a bare button on a row is something you hit while scrolling.
 *
 *   · **It shows the API's refusal verbatim.** Every delete has its own rule —
 *     a college with live students, a course with a running batch, a student
 *     who has paid, a role somebody holds. "This college still has 49 students"
 *     tells an operator what to do next; "could not delete" does not.
 *
 *   · **It says removal is reversible-ish, because it is.** Deletion is soft
 *     everywhere: the row stays, marked. Promising destruction would be a lie,
 *     and an operator who believes it hesitates over the wrong things.
 */
export function DeleteRecord({
  target,
  id,
  label,
  redirectTo = null,
  size = "sm",
}: {
  target: DeleteTarget;
  id: string;
  /** What is being removed, in the operator's words — "Sri Narayana College". */
  label: string;
  /** Set on a DETAIL page, which cannot stay on screen once its record is gone. */
  redirectTo?: string | null;
  size?: "sm" | "md";
}) {
  const action = deleteRecord.bind(null, target, id, redirectTo);
  const [state, submit] = useActionState<FormState, FormData>(action, IDLE);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="cursor-pointer text-body-sm text-danger underline-offset-4 hover:underline"
        >
          Delete
        </button>
        {state.message === undefined ? null : (
          <span className="max-w-64 text-right text-caption text-danger">{state.message}</span>
        )}
      </div>
    );
  }

  return (
    <form action={submit} className="flex flex-col items-end gap-1.5">
      <span className="text-caption text-ink-muted">Remove {label}?</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="cursor-pointer text-caption text-ink-muted underline underline-offset-4"
        >
          Keep
        </button>
        <Confirm size={size} />
      </div>
      {state.message === undefined ? null : (
        <span className="max-w-64 text-right text-caption text-danger">{state.message}</span>
      )}
    </form>
  );
}

function Confirm({ size }: { size: "sm" | "md" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" size={size} disabled={pending}>
      {pending ? "Removing…" : "Remove"}
    </Button>
  );
}
