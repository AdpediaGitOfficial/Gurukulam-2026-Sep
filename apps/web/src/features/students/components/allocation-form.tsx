"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { formatRupees, parseRupees, type Batch, type StudentDetail } from "@gurukulam/contracts";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentTag } from "@/components/patterns/segment-tag";
import { allocateStudent } from "@/features/students/server/actions";
import { IDLE, type FormState } from "@/lib/form";
import { cn } from "@/lib/cn";

export interface AllocationFormProps {
  student: StudentDetail;
  batches: readonly Batch[];
}

interface InstallmentRow {
  id: number;
  amount: string;
  dueDate: string;
}

/** Rupees typed by an operator, as paise. Never through a float. */
function toPaise(input: string): bigint | null {
  if (input.trim() === "") return null;
  try {
    return parseRupees(input);
  } catch {
    return null;
  }
}

/**
 * A full batch stays listed — an operator looking for one by name should find it
 * rather than wonder where it went — but it cannot be chosen, and is never what
 * the form opens on. The API refuses a full batch anyway; offering one only
 * moves the refusal to after the whole schedule has been typed.
 */
const isFull = (batch: Batch): boolean =>
  batch.maxCapacity !== null && (batch.enrolledCount ?? 0) >= batch.maxCapacity;

export function AllocationForm({ student, batches }: AllocationFormProps) {
  const retail = student.enrolmentChannel === "RETAIL";
  const action = allocateStudent.bind(null, student.studentId);
  const [state, submit] = useActionState<FormState, FormData>(action, IDLE);

  const [batchId, setBatchId] = useState(batches.find((b) => !isFull(b))?.batchId ?? "");
  const [courseId, setCourseId] = useState("");

  /**
   * Courses represented among the batches this student may join.
   *
   * Narrowing by course first is how the picker stays readable: an operator
   * arrives knowing which course was sold, and a flat list of every open batch
   * across the catalogue is a scroll, not a choice.
   */
  const courses = [
    ...new Map(
      batches.map((batch) => [batch.courseId, batch.courseName ?? "Unnamed course"]),
    ),
  ].sort((a, b) => a[1].localeCompare(b[1]));

  const shown = courseId === "" ? batches : batches.filter((b) => b.courseId === courseId);
  const [enrolmentValue, setEnrolmentValue] = useState("");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceMode, setAdvanceMode] = useState("UPI");
  const [nextRowId, setNextRowId] = useState(1);
  const [installments, setInstallments] = useState<InstallmentRow[]>([
    { id: 0, amount: "", dueDate: "" },
  ]);

  /**
   * The schedule has to account for the WHOLE enrolment value — the advance is
   * a payment made against that schedule, not a deduction from it. Getting this
   * backwards is easy and expensive: it would reject every correct schedule and
   * accept only short ones, which the API then refuses.
   *
   * Shown as it is typed rather than only on submit, because a hand-authored
   * schedule of twelve rows is tedious to correct after the fact.
   */
  const value = toPaise(enrolmentValue) ?? 0n;
  const advance = toPaise(advanceAmount) ?? 0n;
  const scheduled = installments.reduce<bigint>((sum, row) => sum + (toPaise(row.amount) ?? 0n), 0n);
  const remaining = value - scheduled;
  const balanced = value > 0n && remaining === 0n;
  /** What is still owed once the advance is applied to the schedule. */
  const balanceAfter = value - advance;

  const field = (key: string) => state.fields?.[key];

  const joinable = batches.filter((b) => !isFull(b));

  if (batches.length === 0 || joinable.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No batch this student can join"
          description={
            batches.length > 0
              ? `All ${batches.length} scheduled ${batches.length === 1 ? "batch is" : "batches are"} full. Raise a seat cap or create another before allocating.`
              : retail
                ? "There is no scheduled retail batch open. Create one before allocating."
                : `There is no scheduled batch for ${student.collegeName ?? "this college"}. A college batch is dedicated to its institution — a retail batch is not an option.`
          }
        />
      </Card>
    );
  }

  return (
    <form action={submit} className="flex flex-col gap-8">
      {state.status === "error" && state.message !== undefined ? (
        <Alert intent="danger" title="Could not allocate">
          {state.message}
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          as="h2"
          title="1 · Batch"
          description={
            retail
              ? "Retail students may only join retail batches. A college batch is dedicated to its institution."
              : `Only batches dedicated to ${student.collegeName ?? "this college"} are listed. Retail and college rosters never mix.`
          }
        />

        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Field id="courseFilter" label="Course" className="min-w-56 flex-1 sm:max-w-xs">
            <select
              id="courseFilter"
              value={courseId}
              onChange={(event) => {
                const next = event.target.value;
                setCourseId(next);
                // Keep the selection valid: a batch hidden by the filter must
                // not stay silently selected behind it.
                const first = batches.find(
                  (b) => !isFull(b) && (next === "" || b.courseId === next),
                );
                setBatchId(first?.batchId ?? "");
              }}
              className={controlClass}
            >
              <option value="">All courses ({batches.length})</option>
              {courses.map(([id, name]) => (
                <option key={id} value={id}>
                  {name} ({batches.filter((b) => b.courseId === id).length})
                </option>
              ))}
            </select>
          </Field>
          <p className="pb-3 text-body-sm text-ink-muted">
            {shown.filter((b) => !isFull(b)).length} of {shown.length} have room
          </p>
        </div>

        <ul className="flex max-h-[420px] flex-col gap-2 overflow-y-auto">
          {shown.map((batch) => (
            <li key={batch.batchId}>
              <label
                className={cn(
                  "flex items-center gap-4 rounded-tile border p-4 transition-colors",
                  isFull(batch)
                    ? "cursor-not-allowed border-hairline opacity-50"
                    : batchId === batch.batchId
                      ? "cursor-pointer border-brand bg-brand/[0.04]"
                      : "cursor-pointer border-hairline hover:bg-surface-sunken",
                )}
              >
                <input
                  type="radio"
                  name="batchId"
                  value={batch.batchId}
                  checked={batchId === batch.batchId}
                  disabled={isFull(batch)}
                  onChange={() => setBatchId(batch.batchId)}
                  className="size-4 accent-brand"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-body font-semibold text-ink">{batch.name}</span>
                  <span className="block font-mono text-caption text-ink-subtle">
                    {batch.batchCode} · {batch.courseName ?? "—"}
                  </span>
                </span>
                <SegmentTag segment={batch.segment} />
                <span className="text-body-sm text-ink-muted">
                  starts {new Date(batch.startDate).toLocaleDateString("en-IN")}
                </span>
                <span
                  className={cn(
                    "text-body-sm tabular-nums",
                    isFull(batch) ? "font-semibold text-danger" : "text-ink-muted",
                  )}
                >
                  {isFull(batch) ? "Full · " : ""}
                  {batch.enrolledCount ?? 0}
                  {batch.maxCapacity === null ? "" : ` / ${batch.maxCapacity}`}
                </span>
              </label>
            </li>
          ))}
        </ul>
        {field("batchId") === undefined ? null : (
          <p className="mt-2 text-body-sm text-danger">{field("batchId")}</p>
        )}
      </Card>

      {retail ? (
        <>
          <Card>
            <CardHeader
              as="h2"
              title="2 · Commercials"
              description="The pitched price actually agreed, and whatever was collected on the day."
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <Money
                id="enrolmentValue"
                label="Enrolment value"
                hint="What was agreed, after any discount."
                value={enrolmentValue}
                onChange={setEnrolmentValue}
                error={field("enrolmentValue")}
                required
              />
              <Money
                id="advanceAmount"
                label="Advance collected"
                hint="Leave blank if nothing was taken today."
                value={advanceAmount}
                onChange={setAdvanceAmount}
                error={field("advance.amount")}
              />

              {advanceAmount.trim() === "" ? null : (
                <>
                  <Field id="advanceMode" label="Payment mode">
                    <select
                      id="advanceMode"
                      name="advanceMode"
                      value={advanceMode}
                      onChange={(event) => setAdvanceMode(event.target.value)}
                      className={controlClass}
                    >
                      <option value="UPI">UPI</option>
                      <option value="CREDIT_CARD">Credit card</option>
                      <option value="DEBIT_CARD">Debit card</option>
                      <option value="CASH">Cash</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </Field>

                  <Field id="advancePaidAt" label="Date of payment" error={field("advance.paidAt")}>
                    <input
                      id="advancePaidAt"
                      name="advancePaidAt"
                      type="date"
                      defaultValue={new Date().toISOString().slice(0, 10)}
                      className={controlClass}
                    />
                  </Field>

                  {/* Required for every mode except cash — cash has no external
                      reference to record, which is exactly why it needs a
                      physical receipt instead. */}
                  <Field
                    id="advanceTransactionId"
                    label="Transaction ID"
                    hint={
                      advanceMode === "CASH"
                        ? "Not required for cash."
                        : "Required for every mode except cash."
                    }
                    error={field("advance.transactionId")}
                  >
                    <input
                      id="advanceTransactionId"
                      name="advanceTransactionId"
                      className={controlClass}
                      placeholder="UPI-8841203"
                    />
                  </Field>

                  <Field id="advanceBankOrHandle" label="Bank or handle">
                    <input
                      id="advanceBankOrHandle"
                      name="advanceBankOrHandle"
                      className={controlClass}
                      placeholder="HDFC · name@okhdfc"
                    />
                  </Field>
                </>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              as="h2"
              title="3 · Installment schedule"
              description="Hand-authored, one row to a hundred. It must total the whole enrolment value — an advance is paid against the schedule, not subtracted from it."
              action={
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setInstallments((rows) => [
                      ...rows,
                      { id: nextRowId, amount: "", dueDate: "" },
                    ]);
                    setNextRowId((id) => id + 1);
                  }}
                >
                  Add installment
                </Button>
              }
            />

            <ul className="flex flex-col gap-3">
              {installments.map((row, index) => (
                <li key={row.id} className="flex flex-wrap items-end gap-3">
                  <span className="w-8 pb-3 font-mono text-body-sm text-ink-subtle">
                    I{index + 1}
                  </span>
                  <Money
                    id={`installmentAmount-${row.id}`}
                    name="installmentAmount"
                    label="Amount"
                    hideLabel={index > 0}
                    value={row.amount}
                    onChange={(next) =>
                      setInstallments((rows) =>
                        rows.map((r) => (r.id === row.id ? { ...r, amount: next } : r)),
                      )
                    }
                    className="min-w-40 flex-1"
                  />
                  <Field
                    id={`installmentDueDate-${row.id}`}
                    label="Due date"
                    hideLabel={index > 0}
                    className="min-w-40 flex-1"
                  >
                    <input
                      id={`installmentDueDate-${row.id}`}
                      name="installmentDueDate"
                      type="date"
                      value={row.dueDate}
                      onChange={(event) =>
                        setInstallments((rows) =>
                          rows.map((r) =>
                            r.id === row.id ? { ...r, dueDate: event.target.value } : r,
                          ),
                        )
                      }
                      className={controlClass}
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    // The last row is never removable: a schedule with no rows
                    // is a ledger nothing will ever fall due against.
                    disabled={installments.length === 1}
                    onClick={() =>
                      setInstallments((rows) => rows.filter((r) => r.id !== row.id))
                    }
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>

            <dl className="mt-6 flex flex-wrap gap-8 border-t border-hairline pt-4">
              <Total label="Enrolment value" amount={value} />
              <Total label="Scheduled" amount={scheduled} />
              <Total
                label="Unscheduled"
                amount={remaining}
                tone={value === 0n ? "muted" : remaining === 0n ? "good" : "bad"}
              />
              <Total label="Advance collected" amount={advance} />
              <Total label="Balance after allocation" amount={balanceAfter} />
            </dl>

            {value > 0n && !balanced ? (
              <p className="mt-3 text-body-sm text-warning-strong">
                {remaining > 0n
                  ? `${formatRupees(remaining, { paise: false })} of the enrolment value is not yet scheduled. The advance does not reduce the schedule — it pays against it.`
                  : `The schedule exceeds the enrolment value by ${formatRupees(-remaining, { paise: false })}.`}
              </p>
            ) : null}
            {field("installments") === undefined ? null : (
              <p className="mt-3 text-body-sm text-danger">{field("installments")}</p>
            )}
          </Card>
        </>
      ) : (
        <Card>
          <CardHeader
            as="h2"
            title="2 · Commercials"
            description="Not collected here."
          />
          <p className="text-body-sm text-ink-muted">
            {student.collegeName ?? "This college"} is billed under its own contract, so this
            student gets no individual ledger and no installment schedule. Billing follows
            segment — collecting a price here would create a second, contradictory record of
            what is owed.
          </p>
        </Card>
      )}

      <Card>
        <CardHeader
          as="h2"
          title={retail ? "4 · Access" : "3 · Access"}
          description="Issued as part of the same transaction, not afterwards."
        />
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            name="issueCredentials"
            defaultChecked
            className="mt-1 size-4 accent-brand"
          />
          <span>
            <span className="block text-body font-medium text-ink">
              Issue portal credentials
            </span>
            <span className="block text-body-sm text-ink-muted">
              Generates a password and emails the welcome pack. Access to every session in the
              batch — past and future — is granted either way.
            </span>
          </span>
        </label>
      </Card>

      <div className="flex items-center justify-end gap-4">
        {retail && value > 0n && !balanced ? (
          <p className="text-body-sm text-ink-muted">
            The schedule has to balance before this can be submitted.
          </p>
        ) : null}
        <Submit disabled={retail && !balanced} />
      </div>
    </form>
  );
}

const controlClass =
  "h-12 w-full rounded-tile border border-hairline-strong bg-surface px-4 text-body text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none";

function Field({
  id,
  label,
  hint,
  error,
  hideLabel = false,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  hideLabel?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className={cn("text-body-sm font-medium text-ink", hideLabel && "sr-only")}>
        {label}
      </label>
      {children}
      {hint === undefined ? null : <p className="text-caption text-ink-subtle">{hint}</p>}
      {error === undefined ? null : <p className="text-caption text-danger">{error}</p>}
    </div>
  );
}

function Money({
  id,
  name,
  label,
  hint,
  error,
  value,
  onChange,
  required = false,
  hideLabel = false,
  className,
}: {
  id: string;
  name?: string;
  label: string;
  hint?: string;
  error?: string;
  value: string;
  onChange: (next: string) => void;
  required?: boolean;
  hideLabel?: boolean;
  className?: string;
}) {
  return (
    <Field id={id} label={label} {...(hint === undefined ? {} : { hint })} {...(error === undefined ? {} : { error })} hideLabel={hideLabel} {...(className === undefined ? {} : { className })}>
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-subtle">
          ₹
        </span>
        <input
          id={id}
          name={name ?? id}
          inputMode="decimal"
          required={required}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="0"
          className={cn(controlClass, "pl-8 font-mono tabular-nums")}
        />
      </div>
    </Field>
  );
}

function Total({
  label,
  amount,
  tone = "muted",
}: {
  label: string;
  amount: bigint;
  tone?: "muted" | "good" | "bad";
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-body-sm text-ink-subtle">{label}</dt>
      <dd
        className={cn(
          "font-mono text-h3 tabular-nums",
          tone === "good" ? "text-success-strong" : tone === "bad" ? "text-danger" : "text-ink",
        )}
      >
        {formatRupees(amount, { paise: false })}
      </dd>
    </div>
  );
}

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? "Allocating…" : "Allocate & create ledger"}
    </Button>
  );
}
