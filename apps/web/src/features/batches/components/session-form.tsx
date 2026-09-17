"use client";

import Link from "next/link";
import { useState } from "react";
import type { BatchDetail, CourseTopic, DeliveryMode, Trainer } from "@gurukulam/contracts";

import {
  FormSection,
  FormSelect,
  FormShell,
  FormText,
  FullWidth,
  LockedField,
} from "@/components/patterns/form-shell";
import { buttonVariants } from "@/components/ui/button";
import { createSession } from "@/features/batches/server/actions";

/**
 * Scheduling a session under a batch.
 *
 * The batch is fixed — you arrive here from it — and the topics offered are
 * its course's, because a session taught against a foreign topic makes the
 * curriculum report meaningless and the API refuses it anyway.
 *
 * The date is deliberately unrestricted. A batch that started two months ago
 * needs its delivered sessions recorded, and a form that only accepts future
 * dates cannot describe the past.
 */
export function SessionForm({
  batch,
  topics,
  trainers,
}: {
  batch: BatchDetail;
  topics: readonly CourseTopic[];
  trainers: readonly Trainer[];
}) {
  const [mode, setMode] = useState<DeliveryMode>(batch.mode);

  return (
    <FormShell
      action={createSession.bind(null, batch.batchId)}
      errorTitle="Could not schedule that session"
      submitLabel="Schedule session"
      secondary={
        <Link
          href={`/batches/${batch.batchId}`}
          className={buttonVariants({ variant: "secondary" })}
        >
          Cancel
        </Link>
      }
    >
      <FormSection
        title="The session"
        description="One sitting on one day. Assignments and the recording hang off it once it is marked delivered."
      >
        <LockedField
          label="Batch"
          value={`${batch.name} · ${batch.batchCode}`}
          reason="A session belongs to the batch it was scheduled under."
        />
        <FormText
          name="title"
          label="Session title"
          required
          placeholder="Window functions"
        />
        <FormSelect
          name="topicId"
          label="Topic"
          placeholder={topics.length === 0 ? "The course has no topics yet" : "Not mapped to a topic"}
          disabled={topics.length === 0}
          hint={
            topics.length === 0
              ? "Add topics to the course and this session can be mapped to one."
              : `From ${batch.courseName ?? "this batch's course"} — only its own topics can be taught here.`
          }
          options={topics.map((topic) => ({
            value: topic.topicId,
            label: `${topic.sequence}. ${topic.title}`,
          }))}
        />
        <FormSelect
          name="trainerId"
          label="Trainer"
          placeholder={
            batch.primaryTrainerName === null || batch.primaryTrainerName === undefined
              ? "Nobody confirmed on this batch"
              : `Default — ${batch.primaryTrainerName}`
          }
          hint="Leave blank to use whoever is confirmed on the batch."
          {...(batch.primaryTrainerId === null ? {} : { defaultValue: batch.primaryTrainerId })}
          options={trainers.map((trainer) => ({
            value: trainer.trainerId,
            label: trainer.name,
          }))}
        />
        <FormText
          name="scheduledDate"
          label="Date"
          type="date"
          required
          hint="A past date is fine — that is how a batch already under way gets its history."
        />
        <FormText name="startTime" label="Starts" type="time" required />
        <FormText name="endTime" label="Ends" type="time" required />
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
              defaultValue={batch.meetingLink ?? ""}
            />
          </FullWidth>
        ) : (
          <FullWidth>
            <FormText
              name="venue"
              label="Venue"
              placeholder="Block C · Room 214"
              defaultValue={batch.venue ?? ""}
            />
          </FullWidth>
        )}
      </FormSection>
    </FormShell>
  );
}
