"use client";

import { useActionState, useMemo } from "react";
import { useFormStatus } from "react-dom";
import type { AssignmentSubmission } from "@gurukulam/contracts";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/input";
import { TextareaField } from "@/components/ui/textarea";
import { gradeSubmission } from "@/features/batches/server/actions";
import { IDLE, type FormState } from "@/lib/form";

/**
 * The mark, on the console's side of the same endpoint the trainer posts to.
 *
 * ── Why the console has this at all ────────────────────────────────────
 *
 * The operator override is permanent: a trainer released mid-cohort, one who
 * never marks, a disputed grade re-decided by somebody else. Grading was
 * reachable only from `/teach`, which made "the console performs every action the
 * portals do" false for the one action a student chases.
 *
 * ── Why the assignment id travels in the form ──────────────────────────
 *
 * `revalidatePath` needs the screen's path, and a server action knows only what
 * it is handed. A hidden field costs nothing and keeps the action reusable by any
 * screen that lists submissions.
 */
export function MarkSubmission({
  submission,
  assignmentId,
}: {
  submission: AssignmentSubmission;
  assignmentId: string;
}) {
  const action = useMemo(
    () => gradeSubmission.bind(null, submission.submissionId),
    [submission.submissionId],
  );
  const [state, submit] = useActionState<FormState, FormData>(action, IDLE);

  return (
    <form action={submit} className="flex min-w-0 flex-col gap-3">
      <input type="hidden" name="assignmentId" value={assignmentId} />

      {state.status === "error" && state.message !== undefined ? (
        <Alert intent="danger" title="That mark was not saved">
          {state.message}
        </Alert>
      ) : null}
      {state.status === "idle" && state.message !== undefined ? (
        <Alert intent="success" title="Marked">
          {state.message}
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-[10rem_1fr] sm:items-start">
        <TextField
          id={`marks-${submission.submissionId}`}
          name="marksAwarded"
          label={submission.maxMarks === null ? "Mark" : `Out of ${submission.maxMarks}`}
          type="number"
          inputMode="numeric"
          min={0}
          {...(submission.maxMarks === null ? {} : { max: submission.maxMarks })}
          defaultValue={submission.marksAwarded ?? ""}
          hint={
            submission.maxMarks === null
              ? "This assignment carries no maximum, so it cannot be scored."
              : "Leave empty to give feedback only."
          }
          {...(state.fields?.["marksAwarded"] === undefined
            ? {}
            : { error: state.fields["marksAwarded"] })}
        />
        <TextareaField
          id={`feedback-${submission.submissionId}`}
          name="feedback"
          label="Feedback"
          rows={3}
          defaultValue={submission.feedback ?? ""}
          hint="The student reads this on their portal."
          {...(state.fields?.["feedback"] === undefined ? {} : { error: state.fields["feedback"] })}
        />
      </div>

      <Submit marked={submission.gradedAt !== null} />
    </form>
  );
}

function Submit({ marked }: { marked: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending} className="w-fit">
      {pending ? "Saving…" : marked ? "Replace the mark" : "Save the mark"}
    </Button>
  );
}
