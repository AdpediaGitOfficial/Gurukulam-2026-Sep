"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { SubmissionRow } from "@gurukulam/contracts";

import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { decideSubmissionRow } from "@/features/certificates/server/actions";
import { IDLE, type FormState } from "@/lib/form";

/** A student who is actually on the roster, offered as a match. */
export interface RosterOption {
  studentId: string;
  studentCode: string;
  name: string;
  email: string;
}

const inputClass =
  "h-10 w-full rounded-control border border-hairline-strong bg-surface px-3 text-body-sm text-ink focus:border-brand focus:outline-none";

/**
 * One uploaded name, and the decision on it.
 *
 * **Approving is two steps, and that is not a UI choice.** A filed row carries
 * no matched student, so the API has nobody to evaluate and returns no
 * eligibility for it — the blockers only exist once you say WHO this name is.
 * So the first press asks the question, the API answers with what is in the
 * way, and the override appears only then. Anything else would be a screen
 * offering to override blockers it cannot name.
 *
 * The matching list offers ONLY students on this batch's roster. A college can
 * write any name on a list; a certificate has to name somebody who was
 * actually enrolled, and offering the whole student register here would invite
 * approving a name onto a delivery they never attended.
 */
export function SubmissionRowForm({
  submissionId,
  row,
  roster,
  locked,
}: {
  submissionId: string;
  row: SubmissionRow;
  roster: readonly RosterOption[];
  /** True once the submission is released — decisions are history now. */
  locked: boolean;
}) {
  const action = decideSubmissionRow.bind(null, submissionId, row.rowId);
  const [state, submit] = useActionState<FormState, FormData>(action, IDLE);
  const [decision, setDecision] = useState<"APPROVE" | "REJECT" | null>(null);

  /* The likeliest match, pre-selected: the roster student whose email or code
     the college actually wrote down. Never a fuzzy name match — two students
     called Priya on one roster is ordinary, and guessing between them is how
     the wrong person gets a certificate. */
  const suggested =
    row.studentId ??
    roster.find(
      (option) =>
        (row.uploadedEmail !== null && option.email.toLowerCase() === row.uploadedEmail.toLowerCase()) ||
        (row.uploadedRef !== null && option.studentCode.toLowerCase() === row.uploadedRef.toLowerCase()),
    )?.studentId ??
    "";

  /* The API refused, and its message names the blockers. That refusal IS the
     eligibility report for this row — it is the first moment anything could
     know. `fields` is a validation failure instead (no student picked, no
     reason given), which is not something to override. */
  const refusedForBlockers = state.message !== undefined && state.fields === undefined;

  if (locked || row.status !== "PENDING") {
    return <Decided row={row} />;
  }

  return (
    <form action={submit} className="flex flex-col gap-3">
      {state.message === undefined ? null : (
        <p className="text-body-sm text-danger">{state.message}</p>
      )}

      {decision === null ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={() => setDecision("APPROVE")}>
            Approve
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setDecision("REJECT")}>
            Reject
          </Button>
        </div>
      ) : null}

      {decision === "APPROVE" ? (
        <div className="flex flex-col gap-2">
          <input type="hidden" name="decision" value="APPROVE" />
          <label htmlFor={`student-${row.rowId}`} className="text-caption font-medium text-ink">
            Which student is this?
          </label>
          <select id={`student-${row.rowId}`} name="studentId" defaultValue={suggested} className={inputClass}>
            <option value="">Choose from the roster…</option>
            {roster.map((option) => (
              <option key={option.studentId} value={option.studentId}>
                {option.name} · {option.studentCode}
              </option>
            ))}
          </select>
          {state.fields?.["studentId"] === undefined ? null : (
            <p className="text-caption text-danger">{state.fields["studentId"]}</p>
          )}

          {refusedForBlockers ? (
            <label className="flex cursor-pointer items-start gap-2 text-caption text-ink-muted">
              <input type="checkbox" name="overrideBlockers" className="mt-0.5 size-3.5 accent-brand" />
              <span>
                Approve despite that. Course completion is an admin sign-off, so this is allowed —
                and recorded against your name.
              </span>
            </label>
          ) : (
            <p className="text-caption text-ink-subtle">
              Eligibility is checked against the roster, the schedule and the work handed in the
              moment you name the student.
            </p>
          )}

          <Actions onCancel={() => setDecision(null)} label="Approve this name" />
        </div>
      ) : null}

      {decision === "REJECT" ? (
        <div className="flex flex-col gap-2">
          <input type="hidden" name="decision" value="REJECT" />
          <label htmlFor={`reason-${row.rowId}`} className="text-caption font-medium text-ink">
            Why? The college sees this and corrects the list.
          </label>
          <input
            id={`reason-${row.rowId}`}
            name="reason"
            className={inputClass}
            placeholder="Not on this batch's roster."
          />
          {state.fields?.["reason"] === undefined ? null : (
            <p className="text-caption text-danger">{state.fields["reason"]}</p>
          )}
          <Actions onCancel={() => setDecision(null)} label="Reject this name" />
        </div>
      ) : null}
    </form>
  );
}

function Decided({ row }: { row: SubmissionRow }) {
  if (row.status === "APPROVED") {
    return (
      <div className="flex flex-col gap-1">
        <StatusPill intent="success">Approved</StatusPill>
        {row.certificateId === null || row.certificateId === undefined ? (
          <span className="text-caption text-ink-subtle">Becomes a certificate on release.</span>
        ) : (
          <a
            href={`/students/certificates/${row.certificateId}`}
            className="text-caption text-gold underline-offset-4 hover:underline"
          >
            See the certificate
          </a>
        )}
      </div>
    );
  }
  if (row.status === "REJECTED") {
    return (
      <div className="flex flex-col gap-1">
        <StatusPill intent="danger">Rejected</StatusPill>
        {row.rejectionReason === null ? null : (
          <span className="text-caption text-ink-subtle">{row.rejectionReason}</span>
        )}
      </div>
    );
  }
  return <StatusPill intent="neutral">Not decided</StatusPill>;
}

function Actions({ onCancel, label }: { onCancel: () => void; label: string }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex items-center gap-3">
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : label}
      </Button>
      <button
        type="button"
        onClick={onCancel}
        className="text-caption text-ink-muted underline underline-offset-4"
      >
        Cancel
      </button>
    </div>
  );
}
