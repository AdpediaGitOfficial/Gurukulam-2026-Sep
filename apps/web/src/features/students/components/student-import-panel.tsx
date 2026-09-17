"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  STUDENT_IMPORT_COLUMNS,
  STUDENT_IMPORT_TEMPLATE,
  type ImportOutcome,
  type StudentImportLine,
} from "@gurukulam/contracts";

import { TableScroll } from "@/components/ui/table-scroll";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { TextareaField } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { importStudents, type ImportState } from "@/features/students/server/actions";
import type { FeedbackIntent } from "@/design-system/tokens";

const IDLE: ImportState = { status: "idle" };

const OUTCOME: Record<ImportOutcome, { label: string; intent: FeedbackIntent }> = {
  ADD: { label: "Add", intent: "success" },
  UPDATE: { label: "Update", intent: "info" },
  UNCHANGED: { label: "Already there", intent: "neutral" },
  REJECT: { label: "Refused", intent: "danger" },
};

/**
 * Loading a file of students into the register.
 *
 * The screen says the two things the endpoint does, in the same words:
 *
 *   · **It creates records, not enrolments.** Nobody imported here is on a
 *     batch, has a price or has a login. They land in the unallocated queue,
 *     and the plan says so with a number rather than leaving it to be
 *     discovered.
 *   · **It never moves anyone between segments.** A row that would put an
 *     existing student under a different college is refused, because that
 *     changes who bills them and which rosters they may join.
 *
 * One refused row refuses the file. Loading the good half of a handed-over
 * spreadsheet is how a college ends up with eleven of its forty students and
 * nobody able to see which twenty-nine are missing.
 */
export function StudentImportPanel({
  collegeId = null,
  collegeName = null,
}: {
  /** Pins every row to one institution. Null imports the file as it reads. */
  collegeId?: string | null;
  collegeName?: string | null;
}) {
  const [state, submit] = useActionState<ImportState, FormData>(
    importStudents.bind(null, collegeId),
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
        <Alert
          intent="success"
          title={`${plan.added} student${plan.added === 1 ? "" : "s"} added, ${plan.updated} updated`}
        >
          {plan.unallocated === 0 ? (
            <>Nothing new to allocate.</>
          ) : (
            <>
              All {plan.unallocated} of the new records are unallocated — an import creates the
              record and nothing else. Course, batch, price and credentials are decided per student
              on <a href="/students/unallocated" className="text-brand underline underline-offset-4">the unallocated queue</a>.
            </>
          )}
        </Alert>
      ) : null}

      <Card>
        <div className="flex flex-col gap-5">
          <div>
            <h2 className="text-h3 text-ink">The file</h2>
            <p className="mt-1 text-body-sm text-ink-muted">
              A header row, then one row per student. Only <code>first_name</code> and{" "}
              <code>email</code> are required. Columns are matched by name, so a reordered
              spreadsheet still loads.
            </p>
            {collegeId === null ? (
              <p className="mt-2 text-body-sm text-ink-muted">
                A blank <code>college_code</code> means a <strong>retail</strong> student — that is a
                legitimate answer, not a missing one. Leave <code>student_code</code> blank for
                somebody new; fill it in to correct a record that already exists.
              </p>
            ) : (
              <p className="mt-2 text-body-sm text-ink-muted">
                Every row lands under <strong>{collegeName ?? "this college"}</strong>. The file&rsquo;s own{" "}
                <code>college_code</code> column is ignored here, so a stray value cannot enrol
                somebody elsewhere.
              </p>
            )}
            <p className="mt-2 font-mono text-caption text-ink-muted">
              {STUDENT_IMPORT_COLUMNS.join(" · ")}
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
            placeholder={STUDENT_IMPORT_TEMPLATE}
          />

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-5">
            <a
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(STUDENT_IMPORT_TEMPLATE)}`}
              download="students-import-template.csv"
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
                <span className="text-success-text">{plan.added} to add</span> · {plan.updated} to
                update · {plan.unchanged} already there
                {plan.rejected > 0 ? <> · <span className="text-danger">{plan.rejected} refused</span></> : null}
              </p>
            </div>

            {plan.rejected > 0 ? (
              <Alert
                intent="danger"
                title={`${plan.rejected} row${plan.rejected === 1 ? "" : "s"} refused, so nothing was saved`}
              >
                A file loads whole or not at all. Fix the rows below and check it again.
              </Alert>
            ) : null}

            <TableScroll>
              <table className="w-full min-w-[48rem] border-collapse text-body-sm">
                <caption className="sr-only">Every row in the file, and what the import does with it</caption>
                <thead>
                  <tr className="border-b border-hairline text-left text-caption uppercase tracking-wide text-ink-muted">
                    <th scope="col" className="py-2 pr-4 font-medium">Row</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Outcome</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Student</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Segment</th>
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

function PlanRow({ line }: { line: StudentImportLine }) {
  const outcome = OUTCOME[line.outcome];
  return (
    <tr className="border-b border-hairline/60 align-top last:border-0">
      <td className="py-2.5 pr-4 font-mono text-caption tabular-nums text-ink-muted">{line.rowNumber}</td>
      <td className="py-2.5 pr-4">
        <StatusPill intent={outcome.intent}>{outcome.label}</StatusPill>
      </td>
      <td className="py-2.5 pr-4">
        <span className="text-ink">{line.name}</span>
        <span className="block text-caption text-ink-muted">{line.email}</span>
        {line.studentCode === null ? null : (
          <span className="font-mono text-caption text-ink-muted">{line.studentCode}</span>
        )}
      </td>
      <td className="py-2.5 pr-4 text-ink-muted">
        {line.segment === null ? "—" : line.segment === "COLLEGE" ? (line.collegeName ?? "College") : "Retail"}
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
