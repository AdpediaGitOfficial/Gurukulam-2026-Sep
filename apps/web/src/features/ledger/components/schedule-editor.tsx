"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { formatRupees, fromWire, parseRupees } from "@gurukulam/contracts";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { setSchedule } from "@/features/ledger/server/actions";
import { IDLE, type FormState } from "@/lib/form";

const inputClass =
  "h-11 w-full rounded-control border border-hairline-strong bg-surface px-3 text-body-sm text-ink focus:border-brand focus:outline-none";

export interface ScheduleRow {
  amount: string;
  dueDate: string;
}

/**
 * The hand-authored instalment schedule, for either parent.
 *
 * Invariant 4 — ONE instalment engine, two parents. `fee_installments` carries
 * a nullable `ledger_id` and a nullable `contract_id` with a CHECK that
 * exactly one is set, so a retail student's schedule and a college contract's
 * are the same rows under different parents. This is one component for the
 * same reason: two would drift, and the half that drifted would be the one
 * nobody was looking at.
 *
 * It REPLACES the schedule rather than appending to it. That is the API's
 * contract and the right one — an instalment plan is a single negotiated thing.
 * So the screen says so plainly, and shows the running total against the value
 * being billed, because a plan that does not add up is the mistake this screen
 * exists to prevent.
 */
export function ScheduleEditor({
  parent,
  parentId,
  /** Decimal string from the wire. The schedule should account for all of it. */
  totalMinor,
  existing,
  locked = false,
  lockedReason,
}: {
  parent: "ledger" | "contract";
  parentId: string;
  totalMinor: string | null;
  existing: readonly ScheduleRow[];
  /** True once money has been collected — see `lockedReason`. */
  locked?: boolean;
  lockedReason?: string;
}) {
  const action = setSchedule.bind(null, parent, parentId);
  const [state, submit] = useActionState<FormState, FormData>(action, IDLE);
  const [rows, setRows] = useState<ScheduleRow[]>(
    existing.length > 0 ? [...existing] : [{ amount: "", dueDate: "" }],
  );

  const setRow = (index: number, patch: Partial<ScheduleRow>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  /* Summed in MINOR UNITS through the contract's own parser, never with
     parseFloat. Money is never a float at any layer, display included —
     parseFloat("0.29") * 100 is 28.999999999999996, and a schedule that is one
     paisa short reconciles against nothing. */
  let plannedMinor = 0n;
  let unparseable = false;
  for (const row of rows) {
    if (row.amount.trim() === "") continue;
    try {
      plannedMinor += parseRupees(row.amount);
    } catch {
      unparseable = true;
    }
  }

  const target = totalMinor === null ? null : fromWire(totalMinor);
  const difference = target === null ? null : target - plannedMinor;

  return (
    <Card>
      <CardHeader
        as="h2"
        title="Instalment schedule"
        description="Hand-authored, and replaced as a whole — a plan is one negotiated thing, not a list to append to."
      />

      {locked ? (
        <Alert intent="warning" title="Not editable">
          {lockedReason ?? "Money has been collected against this schedule."}
        </Alert>
      ) : (
        <form action={submit} className="flex flex-col gap-4">
          {state.message === undefined ? null : (
            <Alert intent="danger" title="That schedule was not saved">
              {state.message}
            </Alert>
          )}

          <div className="flex flex-col gap-2">
            {rows.map((row, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-caption tabular-nums text-ink-subtle">
                  {index + 1}
                </span>
                <input
                  name="amount"
                  value={row.amount}
                  onChange={(event) => setRow(index, { amount: event.target.value })}
                  aria-label={`Instalment ${index + 1} amount`}
                  className={inputClass}
                  placeholder="₹ 25,000"
                  inputMode="decimal"
                />
                <input
                  name="dueDate"
                  type="date"
                  value={row.dueDate}
                  onChange={(event) => setRow(index, { dueDate: event.target.value })}
                  aria-label={`Instalment ${index + 1} due date`}
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                  disabled={rows.length <= 1}
                  className="shrink-0 cursor-pointer px-2 text-body-sm text-ink-muted underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setRows((current) => [...current, { amount: "", dueDate: "" }])}
              disabled={rows.length >= 100}
            >
              Add an instalment
            </Button>
            <p className="text-body-sm tabular-nums text-ink-muted">
              Scheduled {formatRupees(plannedMinor)}
              {target === null ? null : <> of {formatRupees(target)}</>}
            </p>
          </div>

          {unparseable ? (
            <p className="text-body-sm text-danger">
              One of those amounts could not be read as money.
            </p>
          ) : difference === null || difference === 0n ? null : (
            <p className={`text-body-sm ${difference > 0n ? "text-warning-strong" : "text-danger"}`}>
              {difference > 0n
                ? `${formatRupees(difference)} of the value is not scheduled yet.`
                : `The schedule is over by ${formatRupees(-difference)}.`}
            </p>
          )}

          <div className="flex justify-end border-t border-hairline pt-4">
            <Submit count={rows.filter((r) => r.amount.trim() !== "").length} />
          </div>
        </form>
      )}
    </Card>
  );
}

function Submit({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || count === 0}>
      {pending ? "Saving…" : `Replace with ${count} instalment${count === 1 ? "" : "s"}`}
    </Button>
  );
}
