"use client";

import { useActionState, useMemo } from "react";
import { useFormStatus } from "react-dom";
import type { SessionAttendance } from "@gurukulam/contracts";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { markAttendance } from "@/features/batches/server/actions";
import { IDLE, type FormState } from "@/lib/form";

const MARKS = [
  { value: "PRESENT", label: "Present" },
  { value: "LATE", label: "Late" },
  { value: "EXCUSED", label: "Excused" },
  { value: "ABSENT", label: "Absent" },
] as const;

/**
 * The register, in the console.
 *
 * ── Why this is not the trainer's RegisterForm ──────────────────────────
 *
 * Same endpoint, different product. `/teach` is a phone held in a classroom, so
 * it spends the width on four tappable targets per student. An operator is at a
 * desk correcting one cohort's history, often for a class they were not in, so a
 * select per row reads a forty-name roster in one screen. Importing the portal's
 * component would also be a feature reaching into another feature, which is the
 * bug the dependency rule exists to stop.
 *
 * ── Why every student defaults to PRESENT ──────────────────────────────
 *
 * That is what a classroom usually looks like, and a register that starts
 * all-absent makes the common case the most work. It is a default rather than a
 * value: nothing is written until this is submitted, so an untaken register stays
 * untaken and `eligibility.service.ts` keeps reporting NOT_EVALUATED instead of a
 * fabricated 100%.
 */
export function TakeRegister({ attendance }: { attendance: SessionAttendance }) {
  const action = useMemo(
    () => markAttendance.bind(null, attendance.sessionId),
    [attendance.sessionId],
  );
  const [state, submit] = useActionState<FormState, FormData>(action, IDLE);

  return (
    <form action={submit} className="flex min-w-0 flex-col gap-5">
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

      <ul className="flex min-w-0 flex-col divide-y divide-hairline">
        {attendance.rows.map((row) => (
          <li
            key={row.studentId}
            className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-3 py-3 first:pt-0"
          >
            <span className="min-w-0">
              <span className="block text-body font-semibold break-words text-ink">
                {row.studentName}
              </span>
              <span className="block font-mono text-caption text-ink-subtle">{row.studentCode}</span>
            </span>
            <Select
              id={`status-${row.studentId}`}
              name={`status:${row.studentId}`}
              aria-label={`${row.studentName} — attendance`}
              options={MARKS}
              /* What is already recorded, or PRESENT for a row with none. The
                 status the register HOLDS is the one it opens on, so re-saving an
                 existing register without touching it changes nothing. */
              defaultValue={row.status ?? "PRESENT"}
              className="w-40"
            />
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4">
        {/* Taken whole, so the count is of the roster rather than of what was
            touched. */}
        <p className="text-body-sm text-ink-muted">
          {attendance.takenAt === null
            ? `${attendance.rows.length} on the roster, none marked yet`
            : `${attendance.rows.length} on the roster, last saved ${attendance.takenAt.slice(0, 10)}`}
        </p>
        <Save taken={attendance.takenAt !== null} />
      </div>
    </form>
  );
}

function Save({ taken }: { taken: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : taken ? "Correct the register" : "Save the register"}
    </Button>
  );
}
