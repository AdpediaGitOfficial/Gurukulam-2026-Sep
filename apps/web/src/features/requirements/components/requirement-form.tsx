"use client";

import Link from "next/link";
import type { College, Course } from "@gurukulam/contracts";

import {
  FormSection,
  FormSelect,
  FormShell,
  FormText,
  FormTextarea,
  FullWidth,
} from "@/components/patterns/form-shell";
import { buttonVariants } from "@/components/ui/button";
import { createRequirement } from "@/features/requirements/server/actions";

/**
 * Logging what a college has asked for.
 *
 * A requirement is an ASK, not a commitment: nothing is scheduled and nobody
 * is assigned until it is confirmed, and confirming it is what creates the
 * dedicated batch. So this form collects the shape of the request and stops —
 * the dates here are the college's preference, not the batch's schedule.
 */
export function RequirementForm({
  colleges,
  courses,
  collegeId,
}: {
  colleges: readonly College[];
  courses: readonly Course[];
  /** Pre-selected when raised from a college's own page. */
  collegeId?: string;
}) {
  return (
    <FormShell
      action={createRequirement}
      errorTitle="Could not log that requirement"
      submitLabel="Log requirement"
      secondary={
        <Link
          href="/colleges/requirements"
          className={buttonVariants({ variant: "secondary" })}
        >
          Cancel
        </Link>
      }
    >
      <FormSection
        title="The ask"
        description="Raised by the institution, or logged here on their behalf. Confirming it later is what creates the batch."
      >
        <FormSelect
          name="collegeId"
          label="College"
          required
          placeholder="Which institution is asking"
          {...(collegeId === undefined ? {} : { defaultValue: collegeId })}
          options={colleges.map((college) => ({
            value: college.collegeId,
            label: college.name,
          }))}
        />
        <FormSelect
          name="courseId"
          label="Course"
          required
          placeholder="What they want run"
          options={courses.map((course) => ({ value: course.courseId, label: course.name }))}
        />
        <FormText
          name="expectedHeadcount"
          label="Expected headcount"
          type="number"
          min={1}
          max={10000}
          required
          placeholder="60"
          hint="Their estimate. The batch's seat cap is set when this is confirmed."
        />
        <FormSelect
          name="preferredMode"
          label="Preferred mode"
          defaultValue="OFFLINE"
          options={[
            { value: "OFFLINE", label: "Offline" },
            { value: "ONLINE", label: "Online" },
            { value: "HYBRID", label: "Hybrid" },
          ]}
        />
        <FormText
          name="preferredWindowStart"
          label="Preferred from"
          type="date"
          hint="When they would like it to run. Not the schedule."
        />
        <FormText name="preferredWindowEnd" label="Preferred until" type="date" />
        <FormText
          name="discipline"
          label="Discipline"
          placeholder="B.Tech Computer Science"
          hint="Which of their students this is for."
        />
        <FormText
          name="source"
          label="How it reached us"
          placeholder="Placement cell · email"
        />
        <FullWidth>
          <FormTextarea
            name="notes"
            label="Anything they said that matters"
            rows={3}
            placeholder="Wants it before the placement season; two batches if headcount allows."
          />
        </FullWidth>
      </FormSection>
    </FormShell>
  );
}
