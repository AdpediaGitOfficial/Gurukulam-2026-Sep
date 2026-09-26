"use client";

import { useActionState, useMemo } from "react";
import { useFormStatus } from "react-dom";
import type { AssignmentSubmission } from "@gurukulam/contracts";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/input";
import { TextareaField } from "@/components/ui/textarea";
import { StatusPill } from "@/components/ui/status-pill";
import { gradeSubmission } from "@/features/teach/server/actions";
import { teachDate } from "@/features/teach/format";
import { IDLE, type FormState } from "@/lib/form";

/**
 * One handed-in piece of work, and the mark going on it.
 *
 * ── Why the work is ON this card ───────────────────────────────────────
 *
 * `content_text` has been stored since the student portal shipped and reached
 * nobody but the student — it was in no contract but `/me`'s. So a trainer was
 * asked to mark work they could not read, which is why this screen did not exist
 * for as long as it did not exist: there was nothing to put on it.
 *
 * ── Why an empty mark is allowed ───────────────────────────────────────
 *
 * "Look at broadcasting again" on work that was never scored out of anything is
 * a real thing to want, and an assignment may carry no maximum at all. A blank
 * field posts null; a zero would tell a student their work was marked and found
 * worthless.
 *
 * ── Why a mark already there is shown before it is overwritten ──────────
 *
 * Both a trainer and an operator can mark the same submission, and the API lets
 * the second one through on purpose — a disputed mark is re-decided by somebody
 * else. The person doing it should see whose mark they are replacing.
 */
export function MarkForm({
  submission,
  editable,
}: {
  submission: AssignmentSubmission;
  /** False for a session that is not theirs to write — the same flag the register uses. */
  editable: boolean;
}) {
  const action = useMemo(
    () => gradeSubmission.bind(null, submission.submissionId),
    [submission.submissionId],
  );
  const [state, submit] = useActionState<FormState, FormData>(action, IDLE);
  const marked = submission.gradedAt !== null;

  return (
    <li className="flex min-w-0 flex-col gap-3 border-b border-hairline py-5 first:pt-0 last:border-b-0">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-body font-semibold break-words text-ink">
            {submission.studentName ?? "A student"}
          </p>
          <p className="font-mono text-caption text-ink-subtle">
            {submission.studentCode ?? ""}
            {submission.submittedAt === null ? "" : ` · handed in ${teachDate(submission.submittedAt)}`}
          </p>
        </div>
        {marked ? (
          <StatusPill intent="success">
            {submission.marksAwarded === null
              ? "feedback given"
              : `${submission.marksAwarded}${submission.maxMarks === null ? "" : ` / ${submission.maxMarks}`}`}
          </StatusPill>
        ) : (
          <StatusPill intent="warning">to mark</StatusPill>
        )}
      </div>

      {/* ── The work ─────────────────────────────────────────────────────── */}
      {submission.contentText === null && submission.fileUrl === null ? (
        <p className="text-body-sm text-ink-subtle">
          They handed in without writing anything or attaching a link.
        </p>
      ) : (
        <div className="flex min-w-0 flex-col gap-2 rounded-well bg-surface-sunken p-4">
          {submission.contentText === null ? null : (
            <p className="min-w-0 break-words whitespace-pre-wrap text-body-sm text-ink">
              {submission.contentText}
            </p>
          )}
          {submission.fileUrl === null ? null : (
            <a
              href={submission.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-fit min-w-0 break-all text-body-sm font-medium text-brand underline-offset-4 hover:underline"
            >
              {submission.fileUrl}
            </a>
          )}
        </div>
      )}

      {marked && submission.gradedByName !== null ? (
        <p className="text-caption text-ink-subtle">
          Marked by {submission.gradedByName}
          {submission.gradedAt === null ? "" : ` on ${teachDate(submission.gradedAt)}`}
        </p>
      ) : null}

      {/* ── The mark ─────────────────────────────────────────────────────── */}
      {!editable ? (
        submission.feedback === null ? null : (
          <p className="text-body-sm text-ink-muted">{submission.feedback}</p>
        )
      ) : (
        <form action={submit} className="flex min-w-0 flex-col gap-3">
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

          <div className="grid gap-3 sm:grid-cols-[10rem_1fr] sm:items-start">
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
                  ? "This assignment carries no maximum — leave it empty."
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
              {...(state.fields?.["feedback"] === undefined
                ? {}
                : { error: state.fields["feedback"] })}
            />
          </div>

          <Submit marked={marked} />
        </form>
      )}
    </li>
  );
}

function Submit({ marked }: { marked: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending} className="w-fit">
      {pending ? "Saving…" : marked ? "Update the mark" : "Save the mark"}
    </Button>
  );
}
