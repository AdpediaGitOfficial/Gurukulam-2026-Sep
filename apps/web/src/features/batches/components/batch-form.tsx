"use client";

import Link from "next/link";
import { useState } from "react";
import type { City, Course, Trainer } from "@gurukulam/contracts";

import {
  FormSection,
  FormSelect,
  FormShell,
  FormText,
  FormTextarea,
  FullWidth,
} from "@/components/patterns/form-shell";
import { buttonVariants } from "@/components/ui/button";
import { createBatch } from "@/features/batches/server/actions";

export function BatchForm({
  cities,
  courses,
  trainers,
}: {
  cities: readonly City[];
  courses: readonly Course[];
  trainers: readonly Trainer[];
}) {
  const [mode, setMode] = useState("OFFLINE");

  return (
    <FormShell
      action={createBatch}
      errorTitle="Could not create that batch"
      submitLabel="Create batch"
      secondary={
        <Link href="/batches" className={buttonVariants({ variant: "secondary" })}>
          Cancel
        </Link>
      }
    >
      <FormSection
        title="The batch"
        description="This creates a retail batch. A college batch comes from confirming that college's requirement, which keeps it tied to the ask that produced it."
      >
        <FormText name="name" label="Batch name" required placeholder="Data Analytics — Sep Cohort A" />
        <FormSelect
          name="courseId"
          label="Course"
          required
          placeholder="Select a course"
          options={courses.map((course) => ({ value: course.courseId, label: course.name }))}
        />
        <FormSelect
          name="cityId"
          label="Operating city"
          placeholder="No city"
          options={cities.map((city) => ({ value: city.cityId, label: city.name }))}
        />
        <FormSelect
          name="mode"
          label="Delivery mode"
          value={mode}
          onChange={(event) => setMode(event.target.value)}
          options={[
            { value: "OFFLINE", label: "Offline" },
            { value: "ONLINE", label: "Online" },
            { value: "HYBRID", label: "Hybrid" },
          ]}
        />
        <FormText name="startDate" label="Start date" type="date" required />
        <FormText name="endDate" label="Projected end date" type="date" />
        <FormText
          name="maxCapacity"
          label="Seat cap"
          type="number"
          min={1}
          max={1000}
          placeholder="25"
          hint="Allocation refuses a full batch, so this is a real limit."
        />
        {/* Offline needs a room, online a link. Asking for both guarantees one
            of them is wrong. */}
        {mode === "ONLINE" ? (
          <FormText name="meetingLink" label="Meeting link" type="url" placeholder="https://…" />
        ) : (
          <FormText name="venue" label="Venue" placeholder="Block C · Room 214" />
        )}
      </FormSection>

      <FormSection
        title="Trainer"
        description="Proposed, not assigned — it is not a commitment until the trainer confirms. Only trainers approved for the chosen course can take it."
      >
        <FormSelect
          name="trainerId"
          label="Propose a trainer"
          placeholder="Nobody yet"
          options={trainers.map((trainer) => ({
            value: trainer.trainerId,
            label: `${trainer.name} · ${trainer.approvedCourseCount ?? 0} approved`,
          }))}
        />
      </FormSection>

      <FormSection title="Notes">
        <FullWidth>
          <FormTextarea name="notes" label="Anything worth recording" rows={3} />
        </FullWidth>
      </FormSection>
    </FormShell>
  );
}
