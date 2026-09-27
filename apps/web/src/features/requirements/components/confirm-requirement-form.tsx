"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { Requirement } from "@gurukulam/contracts";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { confirmRequirement, rejectRequirement } from "@/features/requirements/server/actions";
import { IDLE, type FormState } from "@/lib/form";
import { cn } from "@/lib/cn";

const controlClass =
  "h-12 w-full rounded-tile border border-hairline-strong bg-surface px-4 text-body text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none";

function Field({
  name,
  label,
  hint,
  error,
  className,
  children,
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={name} className="text-body-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint === undefined ? null : <p className="text-caption text-ink-subtle">{hint}</p>}
      {error === undefined ? null : <p className="text-caption text-danger">{error}</p>}
    </div>
  );
}

/**
 * Confirming and rejecting, side by side.
 *
 * Both are terminal — a requirement is answered once — so they sit together
 * rather than one being hidden behind the other. Rejection is the quieter of
 * the two but not hidden: a requirement nobody answers is worse for the college
 * than one turned down with a reason.
 */
export function ConfirmRequirementForm({ requirement }: { requirement: Requirement }) {
  const confirm = confirmRequirement.bind(null, requirement.requirementId);
  const reject = rejectRequirement.bind(null, requirement.requirementId);
  const [confirmState, submitConfirm] = useActionState<FormState, FormData>(confirm, IDLE);
  const [rejectState, submitReject] = useActionState<FormState, FormData>(reject, IDLE);
  const [mode, setMode] = useState(requirement.preferredMode);
  const [rejecting, setRejecting] = useState(false);

  const field = (key: string) => confirmState.fields?.[key];

  /** Defaults drawn from what the college actually asked for. */
  const defaultName = `${requirement.courseName ?? "Training"} — ${requirement.collegeName ?? "College"}`;
  const defaultStart = requirement.preferredWindowStart?.slice(0, 10) ?? "";
  const defaultEnd = requirement.preferredWindowEnd?.slice(0, 10) ?? "";

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          as="h2"
          title="Confirm and create the batch"
          description="Confirming is what creates the dedicated batch. It is one act, not a batch created afterwards and linked back."
        />

        {confirmState.status === "error" && confirmState.message !== undefined ? (
          <Alert intent="danger" title="Could not confirm" className="mb-5">
            {confirmState.message}
          </Alert>
        ) : null}

        <form action={submitConfirm} className="flex flex-col gap-5">
          <Field name="batchName" label="Batch name" error={field("batchName")}>
            <input
              id="batchName"
              name="batchName"
              required
              defaultValue={defaultName}
              className={controlClass}
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              name="startDate"
              label="Start date"
              hint={defaultStart === "" ? undefined : "Prefilled from the college's preferred window."}
              error={field("startDate")}
            >
              <input
                id="startDate"
                name="startDate"
                type="date"
                required
                defaultValue={defaultStart}
                className={controlClass}
              />
            </Field>

            <Field name="endDate" label="Projected end date" error={field("endDate")}>
              <input
                id="endDate"
                name="endDate"
                type="date"
                defaultValue={defaultEnd}
                className={controlClass}
              />
            </Field>

            <Field name="mode" label="Delivery mode">
              <select
                id="mode"
                name="mode"
                value={mode}
                onChange={(event) => setMode(event.target.value as typeof mode)}
                className={controlClass}
              >
                <option value="OFFLINE">Offline</option>
                <option value="ONLINE">Online</option>
                <option value="HYBRID">Hybrid</option>
              </select>
            </Field>

            <Field
              name="maxCapacity"
              label="Seat cap"
              hint={`They asked for ${requirement.expectedHeadcount}.`}
              error={field("maxCapacity")}
            >
              <input
                id="maxCapacity"
                name="maxCapacity"
                type="number"
                min={1}
                defaultValue={requirement.expectedHeadcount}
                className={cn(controlClass, "tabular-nums")}
              />
            </Field>

            {/* Offline needs a room; online needs a link. Asking for both would
                guarantee one of them is wrong. */}
            {mode === "ONLINE" ? (
              <Field
                name="meetingLink"
                label="Meeting link"
                className="sm:col-span-2"
                error={field("meetingLink")}
              >
                <input
                  id="meetingLink"
                  name="meetingLink"
                  type="url"
                  placeholder="https://…"
                  className={controlClass}
                />
              </Field>
            ) : (
              <Field name="venue" label="Venue" className="sm:col-span-2" error={field("venue")}>
                <input
                  id="venue"
                  name="venue"
                  placeholder="Block C · Room 214"
                  className={controlClass}
                />
              </Field>
            )}
          </div>

          <Submit label="Confirm & create batch" pendingLabel="Creating…" className="self-end" />
        </form>
      </Card>

      <Card>
        <CardHeader
          as="h2"
          title="Turn it down"
          description="The reason travels with the record, so the college can revise the ask rather than guess."
        />

        {rejectState.status === "error" && rejectState.message !== undefined ? (
          <Alert intent="danger" title="Could not reject" className="mb-5">
            {rejectState.message}
          </Alert>
        ) : null}

        {rejecting ? (
          <form action={submitReject} className="flex flex-col gap-4">
            <Field
              name="reason"
              label="Reason"
              error={rejectState.fields?.["reason"]}
            >
              <textarea
                id="reason"
                name="reason"
                required
                rows={3}
                placeholder="No trainer approved for this course is free in that window."
                className={cn(controlClass, "h-auto py-3")}
              />
            </Field>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => setRejecting(false)}>
                Cancel
              </Button>
              <Submit label="Reject requirement" pendingLabel="Rejecting…" variant="danger" />
            </div>
          </form>
        ) : (
          <Button type="button" variant="secondary" onClick={() => setRejecting(true)}>
            Reject this requirement
          </Button>
        )}
      </Card>
    </div>
  );
}

function Submit({
  label,
  pendingLabel,
  variant = "primary",
  className,
}: {
  label: string;
  pendingLabel: string;
  variant?: "primary" | "danger";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} className={className}>
      {pending ? pendingLabel : label}
    </Button>
  );
}
