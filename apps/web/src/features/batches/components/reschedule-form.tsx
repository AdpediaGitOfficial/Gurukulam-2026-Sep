"use client";

import { useState } from "react";
import type { SessionDetail } from "@gurukulam/contracts";

import {
  FormSection,
  FormShell,
  FormText,
  FullWidth,
} from "@/components/patterns/form-shell";
import { Button } from "@/components/ui/button";
import { rescheduleSession } from "@/features/batches/server/actions";

/**
 * Moving a session to another day.
 *
 * ── Why this is not the edit screen ─────────────────────────────────────
 *
 * The edit screen corrects a session: a typo in the title, the wrong topic, a
 * venue that was always going to be room 2. This MOVES one, and the API keeps
 * the two apart — a reschedule records where it came from and why, and that
 * pair is what the roster is told. An operator who changes the date on the
 * edit screen has silently moved a cohort with no trace of the old date.
 *
 * ── Why it opens closed ─────────────────────────────────────────────────
 *
 * The session page is read far more often than the schedule is changed, and
 * six fields permanently open under a session nobody is moving is six fields
 * of noise. It also keeps the destructive-ish verb one deliberate click away.
 *
 * ── Why the fields arrive filled ────────────────────────────────────────
 *
 * A move is usually a move of the day, not of the hours: prefilling from the
 * current session means the common case is one field. Venue and meeting link
 * are here rather than left to a second trip, because a session that moves
 * often moves somewhere else, and telling a roster the old room is how people
 * end up outside a locked door.
 */
export function RescheduleForm({ session }: { session: SessionDetail }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body-sm text-ink-muted">
          Moving it keeps the session — attendance, assignments and its recording stay attached.
        </p>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Move this session
        </Button>
      </div>
    );
  }

  return (
    <FormShell
      action={rescheduleSession.bind(null, session.sessionId)}
      errorTitle="Could not move that session"
      submitLabel="Move the session"
      pendingLabel="Moving…"
      secondary={
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      }
    >
      <FormSection
        title="New date and time"
        description="The old date is kept on the record, so the change stays legible afterwards."
      >
        <FormText
          name="scheduledDate"
          label="Date"
          type="date"
          required
          defaultValue={session.scheduledDate}
        />
        <div className="grid grid-cols-2 gap-5">
          <FormText
            name="startTime"
            label="Starts"
            type="time"
            required
            defaultValue={session.startTime}
          />
          <FormText
            name="endTime"
            label="Ends"
            type="time"
            required
            defaultValue={session.endTime}
          />
        </div>
        <FormText
          name="venue"
          label="Venue"
          defaultValue={session.venue ?? ""}
          hint="Carried over unless you change it."
        />
        <FormText
          name="meetingLink"
          label="Meeting link"
          type="url"
          defaultValue={session.meetingLink ?? ""}
          hint="Leave blank for a session in a room."
        />
        <FullWidth>
          <FormText
            name="reason"
            label="Why it moved"
            required
            placeholder="Trainer unavailable — moved to the Thursday"
            hint="Required. Shown beside the session so the change explains itself."
          />
        </FullWidth>
      </FormSection>
    </FormShell>
  );
}
