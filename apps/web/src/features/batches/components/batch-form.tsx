"use client";

import Link from "next/link";
import { useState } from "react";
import type { BatchDetail, City, Course, DeliveryMode, Trainer } from "@gurukulam/contracts";

import {
  FormSection,
  FormSelect,
  FormShell,
  FormText,
  FormTextarea,
  FullWidth,
  LockedField,
} from "@/components/patterns/form-shell";
import { buttonVariants } from "@/components/ui/button";
import { saveBatch } from "@/features/batches/server/actions";

export function BatchForm({
  cities,
  courses,
  trainers,
  batch,
}: {
  cities: readonly City[];
  courses: readonly Course[];
  trainers: readonly Trainer[];
  batch?: BatchDetail;
}) {
  const editing = batch !== undefined;
  const [mode, setMode] = useState<DeliveryMode>(batch?.mode ?? "OFFLINE");

  /**
   * The API refuses a second proposal while one is proposed or confirmed, so
   * the picker is only offered when nothing is open. Withdrawing an existing
   * proposal is a deliberate act, not a side effect of correcting a venue.
   */
  const openAssignment = batch?.trainerAssignments.find(
    (assignment) => assignment.status === "PROPOSED" || assignment.status === "CONFIRMED",
  );

  return (
    <FormShell
      action={saveBatch.bind(null, batch?.batchId)}
      errorTitle={editing ? "Could not save that batch" : "Could not create that batch"}
      submitLabel={editing ? "Save changes" : "Create batch"}
      secondary={
        <Link href="/batches" className={buttonVariants({ variant: "secondary" })}>
          Cancel
        </Link>
      }
    >
      <FormSection
        title="The batch"
        description={
          editing
            ? "A batch keeps the course and the college it was created with — both decide who may sit on its roster."
            : "This creates a retail batch. A college batch comes from confirming that college's requirement, which keeps it tied to the ask that produced it."
        }
      >
        <FormText
          name="name"
          label="Batch name"
          required
          placeholder="Data Analytics — Sep Cohort A"
          defaultValue={batch?.name}
        />
        {editing ? (
          <LockedField
            label="Course"
            value={batch.courseName ?? "—"}
            reason="It decides which trainers may take the batch and which topics its sessions hang off."
          />
        ) : (
          <FormSelect
            name="courseId"
            label="Course"
            required
            placeholder="Select a course"
            options={courses.map((course) => ({ value: course.courseId, label: course.name }))}
          />
        )}
        {editing ? (
          <LockedField
            label="Segment"
            value={
              batch.segment === "RETAIL"
                ? "Retail — open cohort"
                : `College — ${batch.collegeName ?? "dedicated"}`
            }
            reason="Retail and college rosters never mix, so a batch cannot change which one it serves."
          />
        ) : null}
        <FormSelect
          name="cityId"
          label="Operating city"
          placeholder="No city"
          defaultValue={batch?.cityId ?? ""}
          options={cities.map((city) => ({ value: city.cityId, label: city.name }))}
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
        <FormText
          name="startDate"
          label="Start date"
          type="date"
          required
          defaultValue={batch?.startDate}
        />
        <FormText
          name="endDate"
          label="Projected end date"
          type="date"
          defaultValue={batch?.endDate ?? ""}
        />
        <FormText
          name="maxCapacity"
          label="Seat cap"
          type="number"
          min={1}
          max={1000}
          placeholder="25"
          hint={
            editing && batch.enrolledCount !== undefined
              ? `Allocation refuses a full batch. ${batch.enrolledCount} enrolled so far.`
              : "Allocation refuses a full batch, so this is a real limit."
          }
          defaultValue={batch?.maxCapacity ?? ""}
        />
        {/* Offline needs a room, online a link. Asking for both guarantees one
            of them is wrong. */}
        {mode === "ONLINE" ? (
          <FormText
            name="meetingLink"
            label="Meeting link"
            type="url"
            placeholder="https://…"
            defaultValue={batch?.meetingLink ?? ""}
          />
        ) : (
          <FormText
            name="venue"
            label="Venue"
            placeholder="Block C · Room 214"
            defaultValue={batch?.venue ?? ""}
          />
        )}
        {editing ? (
          <FormSelect
            name="status"
            label="Status"
            required
            defaultValue={batch.status}
            hint="Completing a batch is what makes its students certificate-eligible."
            options={[
              { value: "SCHEDULED", label: "Scheduled" },
              { value: "IN_PROGRESS", label: "In progress" },
              { value: "COMPLETED", label: "Completed" },
              { value: "CANCELLED", label: "Cancelled" },
            ]}
          />
        ) : null}
      </FormSection>

      <FormSection
        title="Trainer"
        description="Proposed, not assigned — it is not a commitment until the trainer confirms. Only trainers approved for the chosen course can take it."
      >
        {openAssignment === undefined ? (
          <FormSelect
            name="trainerId"
            label="Propose a trainer"
            placeholder="Nobody yet"
            options={trainers.map((trainer) => ({
              value: trainer.trainerId,
              label: `${trainer.name} · ${trainer.approvedCourseCount ?? 0} approved`,
            }))}
          />
        ) : (
          <LockedField
            label={openAssignment.status === "CONFIRMED" ? "Confirmed trainer" : "Proposed trainer"}
            value={openAssignment.trainerName ?? "—"}
            reason={
              openAssignment.status === "CONFIRMED"
                ? "Confirmed delivery. Withdraw the assignment before proposing someone else."
                : "Awaiting their answer. Withdraw the proposal before proposing someone else."
            }
          />
        )}
      </FormSection>

      <FormSection title="Notes">
        <FullWidth>
          <FormTextarea
            name="notes"
            label="Anything worth recording"
            rows={3}
            defaultValue={batch?.notes ?? ""}
          />
        </FullWidth>
      </FormSection>
    </FormShell>
  );
}
