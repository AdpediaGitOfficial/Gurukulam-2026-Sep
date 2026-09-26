"use client";

import { useActionState, useMemo } from "react";
import { useFormStatus } from "react-dom";
import type { SessionAttendance } from "@gurukulam/contracts";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { markAttendance } from "@/features/teach/server/actions";
import { IDLE, type FormState } from "@/lib/form";
import { cn } from "@/lib/cn";

const MARKS = [
  { value: "PRESENT", label: "Present" },
  { value: "LATE", label: "Late" },
  { value: "EXCUSED", label: "Excused" },
  { value: "ABSENT", label: "Absent" },
] as const;

/**
 * The register.
 *
 * ── Why every student defaults to PRESENT ──────────────────────────────
 *
 * Because that is what a classroom usually looks like, and a register that
 * starts all-absent makes the common case the most work — a trainer taps
 * thirty times to record a normal Tuesday. Defaulting to present and tapping
 * the exceptions is the shape of how the job is actually done.
 *
 * It is a default, not a value: nothing is written until the form is submitted,
 * so an unopened register stays unmarked and the eligibility check keeps
 * reporting NOT_EVALUATED rather than a fabricated 100%.
 *
 * ── Why radios and not a dropdown ──────────────────────────────────────
 *
 * A trainer marking a register is standing in a room holding a phone. Four
 * visible targets beat a select that costs a tap to open and hides the state
 * of every other student while it is.
 */
export function RegisterForm({ attendance }: { attendance: SessionAttendance }) {
  const action = useMemo(
    () => markAttendance.bind(null, attendance.sessionId),
    [attendance.sessionId],
  );
  const [state, submit] = useActionState<FormState, FormData>(action, IDLE);

  return (
    <form action={submit} className="flex flex-col gap-5">
      {state.status === "error" && state.message !== undefined ? (
        <Alert intent="danger" title="That register was not saved">
          {state.message}
        </Alert>
      ) : null}
      {state.status === "idle" && state.message !== undefined ? (
        <Alert intent="success" title="Saved">
          {state.message}
        </Alert>
      ) : null}

      <ul className="flex flex-col divide-y divide-hairline">
        {attendance.rows.map((row) => (
          <li key={row.studentId} className="flex min-w-0 flex-col gap-2 py-4 first:pt-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="min-w-0">
                <span className="text-body font-semibold break-words text-ink">
                  {row.studentName}
                </span>
                <span className="block font-mono text-caption text-ink-subtle">
                  {row.studentCode}
                </span>
              </span>
            </div>

            <fieldset className="flex flex-wrap gap-2">
              <legend className="sr-only">How {row.studentName} attended</legend>
              {MARKS.map((mark) => (
                <label
                  key={mark.value}
                  className={cn(
                    "flex h-11 cursor-pointer items-center rounded-control border px-4 text-body-sm",
                    "border-hairline-strong bg-surface text-ink-muted",
                    "has-[:checked]:border-teach has-[:checked]:bg-teach has-[:checked]:font-semibold has-[:checked]:text-on-teach",
                  )}
                >
                  <input
                    type="radio"
                    name={`status:${row.studentId}`}
                    value={mark.value}
                    // Present by default, and whatever was recorded if the
                    // register has been taken before.
                    defaultChecked={(row.status ?? "PRESENT") === mark.value}
                    className="sr-only"
                  />
                  {mark.label}
                </label>
              ))}
            </fieldset>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-end gap-3 border-t border-hairline pt-5">
        <Submit taken={attendance.takenAt !== null} />
      </div>
    </form>
  );
}

function Submit({ taken }: { taken: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : taken ? "Update the register" : "Take the register"}
    </Button>
  );
}
