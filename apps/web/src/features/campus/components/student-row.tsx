"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { Batch, Student } from "@gurukulam/contracts";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select";
import { StatusPill } from "@/components/ui/status-pill";
import { allocateStudent } from "@/features/campus/server/actions";
import { IDLE } from "@/lib/form";

/**
 * One of the college's students, and the one act the college has over them.
 *
 * ── Why placing them is the only verb here ─────────────────────────────
 *
 * The console's student row carries suspend, deallocate, roster outcome and
 * delete. Every one of those answers 403 for a college user, decided in the API
 * by `assertOursToDecide` — suspension stops a person signing in to work they
 * are enrolled on, ending an enrolment withdraws the access and credential that
 * allocation granted, and how someone's time on a batch ended is a delivery
 * judgement that decides their certificate.
 *
 * Offering a control the server will refuse is how a portal teaches the person
 * in front of it that the product is broken. So the row has one verb, and it is
 * the one the docs always said was theirs: adding their students to their
 * cohorts.
 */
export function StudentRow({ student, batches }: { student: Student; batches: Batch[] }) {
  const onACohort = student.batchId !== null && student.batchId !== undefined;

  return (
    <li className="flex min-w-0 flex-col gap-3 border-b border-hairline py-4 last:border-b-0">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-body font-semibold break-words text-ink">
            {[student.firstName, student.lastName].filter(Boolean).join(" ")}
          </p>
          <p className="font-mono text-caption text-ink-subtle">{student.studentCode}</p>
        </div>
        {student.accountStatus === "SUSPENDED" ? (
          /* Shown, not actionable: the college can see that an account is
             stopped — otherwise a student saying "I cannot sign in" is a mystery
             at both ends — and only we can stop or restart one. */
          <StatusPill intent="danger">account suspended</StatusPill>
        ) : onACohort ? (
          <StatusPill intent="success">{student.batchCode ?? "on a cohort"}</StatusPill>
        ) : (
          <StatusPill intent="warning">not placed</StatusPill>
        )}
      </div>

      <p className="min-w-0 break-words text-body-sm text-ink-muted">{student.email}</p>

      {onACohort ? null : <Placement student={student} batches={batches} />}
    </li>
  );
}

/**
 * Putting a student on a cohort.
 *
 * No money anywhere on it. `allocateStudentSchema` carries an enrolment value,
 * an advance and an installment schedule, and all three are RETAIL — invariant
 * 3 gives a college student no individual ledger at all, because the institution
 * is billed under its contract instead.
 *
 * The batch list is the college's own, scoped by the API. A batch of another
 * college or a retail batch is not in it — and if one somehow were, the
 * allocation service would refuse it by name (invariant 2), which is why this
 * shows the API's sentence rather than pre-judging.
 */
function Placement({ student, batches }: { student: Student; batches: Batch[] }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(allocateStudent.bind(null, student.studentId), IDLE);

  if (batches.length === 0) {
    return (
      <p className="text-body-sm text-ink-subtle">
        No cohort is open for them yet. Raise a requirement and we will open one.
      </p>
    );
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" className="w-fit" onClick={() => setOpen(true)}>
        Place on a cohort
      </Button>
    );
  }

  return (
    <form action={action} className="flex min-w-0 flex-col gap-3 rounded-well bg-surface-sunken p-4">
      {state.status === "error" && state.message !== undefined ? (
        <Alert intent="danger" title="Not placed">
          {state.message}
        </Alert>
      ) : null}

      <SelectField
        id={`batchId-${student.studentId}`}
        name="batchId"
        label={`Which cohort for ${student.firstName}?`}
        placeholder="Choose a cohort"
        defaultValue=""
        options={batches.map((batch) => ({
          value: batch.batchId,
          label: `${batch.name} · starts ${batch.startDate}`,
        }))}
        required
        {...(state.fields?.["batchId"] === undefined ? {} : { error: state.fields["batchId"] })}
      />

      <div className="flex flex-wrap gap-2">
        <Submit />
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Placing…" : "Place them"}
    </Button>
  );
}
