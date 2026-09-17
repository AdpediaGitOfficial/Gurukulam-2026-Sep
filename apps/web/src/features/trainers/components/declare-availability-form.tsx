"use client";

import { useState } from "react";

import {
  FormSection,
  FormSelect,
  FormShell,
  FormText,
  FullWidth,
} from "@/components/patterns/form-shell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { declareAvailability } from "@/features/trainers/server/actions";

/**
 * Declaring a window this trainer is not available.
 *
 * ── Why this had to exist ───────────────────────────────────────────────
 *
 * The console could already WITHDRAW an availability window and never create
 * one — you could cancel leave you had no way to declare. Half of invariant 8
 * was inert as a result: free/busy is computed from committed sessions plus
 * declared leave, and with nothing writing the second half the calendar only
 * ever knew about the first.
 *
 * ── Why a whole day and part of one are different shapes ────────────────
 *
 * Leave is almost always whole days and a blocked window is almost always
 * hours, so the switch changes the fields rather than asking for a time
 * somebody then has to think about. Ticked, the inputs take dates and the
 * action widens them to the day's real edges; unticked, they take a moment
 * each. Both submit under the same two names, so a message about the end
 * landing before the start binds to the field either way.
 *
 * ── Why the refusal is worth waiting for ────────────────────────────────
 *
 * The API refuses a window covering a session the trainer is already committed
 * to, and names the batch and the date. That refusal is the point — leave that
 * silently swallowed a confirmed delivery is how a cohort turns up to an empty
 * room — so nothing here tries to pre-empt it with a guess.
 */
export function DeclareAvailabilityForm({
  trainerId,
  trainerName,
}: {
  trainerId: string;
  trainerName: string;
}) {
  const [open, setOpen] = useState(false);
  const [fullDay, setFullDay] = useState(true);

  if (!open) {
    return (
      <div className="flex justify-end">
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Declare leave
        </Button>
      </div>
    );
  }

  return (
    <FormShell
      className="rounded-card border border-hairline bg-surface p-6"
      action={declareAvailability.bind(null, trainerId)}
      errorTitle="Could not declare that window"
      submitLabel="Declare it"
      pendingLabel="Declaring…"
      secondary={
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      }
    >
      <FormSection
        title={`Away — ${trainerName}`}
        description="Withdraws them from the calendar for this window. It does not touch batches they are already confirmed on — a window covering one of those sessions is refused, and says which."
      >
        <FormSelect
          name="type"
          label="What kind"
          defaultValue="LEAVE"
          hint="Leave is theirs; blocked time is ours."
          options={[
            { value: "LEAVE", label: "Leave" },
            { value: "BLOCKED", label: "Blocked time" },
          ]}
        />
        <div className="flex h-full items-end pb-1">
          <Checkbox
            id="isFullDay"
            name="isFullDay"
            label="Whole days"
            hint="Untick to block part of one."
            checked={fullDay}
            onChange={(event) => setFullDay(event.currentTarget.checked)}
          />
        </div>
        <FormText
          name="startsAt"
          label={fullDay ? "First day" : "From"}
          type={fullDay ? "date" : "datetime-local"}
          required
        />
        <FormText
          name="endsAt"
          label={fullDay ? "Last day" : "Until"}
          type={fullDay ? "date" : "datetime-local"}
          required
          hint={fullDay ? "Inclusive — the same date for a single day." : undefined}
        />
        <FullWidth>
          <FormText
            name="reason"
            label="Why"
            placeholder="Wedding in the family"
            hint="Optional, and shown beside the window. An unexplained fortnight is the one somebody has to go and ask about."
          />
        </FullWidth>
      </FormSection>
    </FormShell>
  );
}
