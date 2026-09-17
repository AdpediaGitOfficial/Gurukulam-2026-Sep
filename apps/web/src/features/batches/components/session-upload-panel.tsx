"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  SESSION_UPLOAD_COLUMNS,
  SESSION_UPLOAD_TEMPLATE,
  type SessionUploadLine,
  type UploadOutcome,
} from "@gurukulam/contracts";

import { TableScroll } from "@/components/ui/table-scroll";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { TextareaField } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { uploadSessions, type UploadState } from "@/features/batches/server/actions";
import type { FeedbackIntent } from "@/design-system/tokens";

const IDLE: UploadState = { status: "idle" };

const OUTCOME: Record<UploadOutcome, { label: string; intent: FeedbackIntent }> = {
  ADD: { label: "Add", intent: "success" },
  UPDATE: { label: "Update", intent: "info" },
  UNCHANGED: { label: "Already there", intent: "neutral" },
  REJECT: { label: "Refused", intent: "danger" },
};

/**
 * Loading a file of sessions into a batch.
 *
 * The screen says the same thing the endpoint does, in the same words: **this
 * adds, it never replaces**. The plan is not optional decoration — nothing is
 * written until the operator has read what is about to happen, because
 * "it replaced my sessions" is not something anyone should discover afterwards.
 *
 * One refused row refuses the file. Loading the good half of a spreadsheet
 * leaves a schedule missing Tuesdays that nobody can see is missing.
 */
export function SessionUploadPanel({
  batchId,
  batchCode,
}: {
  batchId: string;
  batchCode: string;
}) {
  const [state, submit] = useActionState<UploadState, FormData>(
    uploadSessions.bind(null, batchId),
    IDLE,
  );

  const plan = state.result;
  const committed = plan?.committed === true;

  return (
    <form action={submit} className="flex flex-col gap-6">
      {state.message === undefined ? null : (
        <Alert intent="danger" title="That file could not be read">
          {state.message}
        </Alert>
      )}

      {committed ? (
        <Alert intent="success" title={`${plan.batchCode} now holds ${plan.existingBefore + plan.added} sessions`}>
          {plan.added} added, {plan.updated} updated, {plan.unchanged} already there. Nothing was
          removed — an upload only ever adds to a schedule.
        </Alert>
      ) : null}

      <Card>
        <div className="flex flex-col gap-5">
          <div>
            <h2 className="text-h3 text-ink">The file</h2>
            <p className="mt-1 text-body-sm text-ink-muted">
              A header row, then one row per session. Only <code>date</code>, <code>start_time</code>,{" "}
              <code>end_time</code> and <code>title</code> are required — a blank{" "}
              <code>trainer_code</code> or <code>mode</code> inherits the batch&rsquo;s own.
              Columns are matched by name, so a reordered spreadsheet still loads.
            </p>
            <p className="mt-2 font-mono text-caption text-ink-muted">
              {SESSION_UPLOAD_COLUMNS.join(" · ")}
            </p>
          </div>

          <Field htmlFor="file" label="Choose a CSV" hint="Or paste the rows below — whichever is to hand.">
            <input
              id="file"
              name="file"
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/plain"
              className="block w-full text-body-sm text-ink-muted file:mr-4 file:h-11 file:cursor-pointer file:rounded-control file:border-0 file:bg-surface-sunken file:px-4 file:text-body-sm file:text-ink"
            />
          </Field>

          <TextareaField
            id="csv"
            name="csv"
            label="Or paste the rows"
            rows={8}
            defaultValue={state.csv ?? ""}
            className="font-mono text-caption"
            hint="Copied straight out of a spreadsheet — tabs are read as well as commas."
            placeholder={SESSION_UPLOAD_TEMPLATE}
          />

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-5">
            <a
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(SESSION_UPLOAD_TEMPLATE)}`}
              download={`${batchCode}-sessions-template.csv`}
              className="text-body-sm text-brand underline underline-offset-4"
            >
              Download the template
            </a>
            <Submit name="intent" value="plan" label="Check the file" pending="Checking…" />
          </div>
        </div>
      </Card>

      {plan === undefined ? null : (
        <Card>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-h3 text-ink">
                {committed ? "What was written" : "What this would do"}
              </h2>
              <p className="text-body-sm text-ink-muted tabular-nums">
                {plan.existingBefore} session{plan.existingBefore === 1 ? "" : "s"} already in{" "}
                {plan.batchCode} · <span className="text-success-text">{plan.added} to add</span> ·{" "}
                {plan.updated} to update · {plan.unchanged} already there
                {plan.rejected > 0 ? <> · <span className="text-danger">{plan.rejected} refused</span></> : null}
              </p>
            </div>

            {plan.rejected > 0 ? (
              <Alert intent="danger" title={`${plan.rejected} row${plan.rejected === 1 ? "" : "s"} refused, so nothing was saved`}>
                A file loads whole or not at all. Fix the rows below and check it again — loading the
                good half is how a schedule ends up missing a day nobody notices.
              </Alert>
            ) : null}

            <TableScroll>
              <table className="w-full min-w-[46rem] border-collapse text-body-sm">
                <caption className="sr-only">Every row in the file, and what the upload does with it</caption>
                <thead>
                  <tr className="border-b border-hairline text-left text-caption uppercase tracking-wide text-ink-muted">
                    <th scope="col" className="py-2 pr-4 font-medium">Row</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Outcome</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Session</th>
                    <th scope="col" className="py-2 pr-4 font-medium">When</th>
                    <th scope="col" className="py-2 font-medium">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.lines.map((line) => (
                    <PlanRow key={line.rowNumber} line={line} />
                  ))}
                </tbody>
              </table>
            </TableScroll>

            {committed || plan.rejected > 0 ? null : (
              <div className="flex items-center justify-end gap-3 border-t border-hairline pt-5">
                {/* The commit sends the very text that was planned, so the plan
                    on screen and the rows that land can never be two files. */}
                <input type="hidden" name="csv" value={state.csv ?? ""} />
                <Submit
                  name="intent"
                  value="commit"
                  label={
                    plan.added + plan.updated === 0
                      ? "Nothing to save"
                      : `Add ${plan.added} and update ${plan.updated}`
                  }
                  pending="Saving…"
                  disabled={plan.added + plan.updated === 0}
                />
              </div>
            )}
          </div>
        </Card>
      )}
    </form>
  );
}

function PlanRow({ line }: { line: SessionUploadLine }) {
  const outcome = OUTCOME[line.outcome];
  return (
    <tr className="border-b border-hairline/60 align-top last:border-0">
      <td className="py-2.5 pr-4 font-mono text-caption tabular-nums text-ink-muted">{line.rowNumber}</td>
      <td className="py-2.5 pr-4">
        <StatusPill intent={outcome.intent}>{outcome.label}</StatusPill>
      </td>
      <td className="py-2.5 pr-4">
        <span className="text-ink">{line.title}</span>
        {line.sessionCode === null ? null : (
          <span className="ml-2 font-mono text-caption text-ink-muted">{line.sessionCode}</span>
        )}
      </td>
      <td className="py-2.5 pr-4 whitespace-nowrap tabular-nums text-ink-muted">
        {line.scheduledDate} · {line.startTime}
      </td>
      <td className={`py-2.5 ${line.outcome === "REJECT" ? "text-danger" : "text-ink-muted"}`}>
        {line.detail ?? "—"}
      </td>
    </tr>
  );
}

function Submit({
  name,
  value,
  label,
  pending: pendingLabel,
  disabled,
}: {
  name: string;
  value: string;
  label: string;
  pending: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" name={name} value={value} disabled={pending || disabled}>
      {pending ? pendingLabel : label}
    </Button>
  );
}
