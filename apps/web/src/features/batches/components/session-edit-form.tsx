"use client";

import Link from "next/link";
import { useState } from "react";
import type { CourseTopic, DeliveryMode, SessionDetail, Trainer } from "@gurukulam/contracts";

import {
  FormSection,
  FormSelect,
  FormShell,
  FormText,
  FullWidth,
  LockedField,
} from "@/components/patterns/form-shell";
import { buttonVariants } from "@/components/ui/button";
import { updateSession } from "@/features/batches/server/actions";

/**
 * Correcting a session that has already been scheduled.
 *
 * What this form does NOT offer is the point of it. The date and the time are
 * shown locked, because moving a session is a **reschedule** — it updates in
 * place so attendance and the recording stay attached, and it tells the roster
 * why it moved. A quiet edit would notify nobody, so the move lives on its own
 * control and this one says where to find it.
 */
export function SessionEditForm({
  session,
  topics,
  trainers,
}: {
  session: SessionDetail;
  topics: readonly CourseTopic[];
  trainers: readonly Trainer[];
}) {
  const [mode, setMode] = useState<DeliveryMode>(session.mode);

  return (
    <FormShell
      action={updateSession.bind(null, session.sessionId)}
      errorTitle="Could not save that session"
      submitLabel="Save changes"
      secondary={
        <Link
          href={`/batches/sessions/${session.sessionId}`}
          className={buttonVariants({ variant: "secondary" })}
        >
          Cancel
        </Link>
      }
    >
      <FormSection
        title="The session"
        description="Corrections to what it is and who teaches it. When it happens is a reschedule."
      >
        <LockedField
          label="Session ID"
          value={session.sessionCode}
          reason="Generated on save. Assignments, attendance and the recording all point at it."
        />
        <LockedField
          label="When"
          value={`${session.scheduledDate} · ${session.startTime}–${session.endTime}`}
          reason="Moving a session is a reschedule — it tells the roster why it moved, so it asks for a reason."
        />
        <FullWidth>
          <FormText name="title" label="Session title" required defaultValue={session.title} />
        </FullWidth>
        <FormSelect
          name="topicId"
          label="Topic"
          placeholder={topics.length === 0 ? "The course has no topics yet" : "Not mapped to a topic"}
          disabled={topics.length === 0}
          defaultValue={session.topicId ?? ""}
          hint="Only this batch's own course's topics — anything else makes the curriculum report meaningless."
          options={topics.map((topic) => ({
            value: topic.topicId,
            label: `${topic.sequence}. ${topic.title}`,
          }))}
        />
        <FormSelect
          name="trainerId"
          label="Trainer"
          placeholder="Whoever is confirmed on the batch"
          defaultValue={session.trainerId ?? ""}
          hint="A substitute for one day is set here, and leaves the batch's own trainer alone."
          options={trainers.map((trainer) => ({ value: trainer.trainerId, label: trainer.name }))}
        />
        <FormSelect
          name="mode"
          label="Delivery mode"
          value={mode}
          onChange={(event) => setMode(event.target.value as DeliveryMode)}
          options={[
            { value: "OFFLINE", label: "Offline" },
            { value: "ONLINE", label: "Online" },
            { value: "HYBRID", label: "Hybrid" },
          ]}
        />
        {/* Offline needs a room, online a link. Asking for both guarantees one
            of them is wrong. */}
        {mode === "ONLINE" ? (
          <FullWidth>
            <FormText
              name="meetingLink"
              label="Meeting link"
              type="url"
              placeholder="https://…"
              defaultValue={session.meetingLink ?? ""}
            />
          </FullWidth>
        ) : (
          <FullWidth>
            <FormText
              name="venue"
              label="Venue"
              placeholder="Block C · Room 214"
              defaultValue={session.venue ?? ""}
            />
          </FullWidth>
        )}
      </FormSection>
    </FormShell>
  );
}
