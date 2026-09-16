"use client";

import Link from "next/link";
import type { College, Course, Requirement } from "@gurukulam/contracts";

import {
  FormSection,
  FormSelect,
  FormShell,
  FormText,
  FormTextarea,
  FullWidth,
} from "@/components/patterns/form-shell";
import { buttonVariants } from "@/components/ui/button";
import { createRequirement, updateRequirement } from "@/features/requirements/server/actions";

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
  requirement,
}: {
  colleges: readonly College[];
  courses: readonly Course[];
  /** Pre-selected when raised from a college's own page. */
  collegeId?: string;
  /**
   * Present when correcting one. The COLLEGE and COURSE are then fixed: they
   * are the ask itself, and confirming a requirement creates a dedicated batch
   * (invariant 14), so changing the course after the fact would produce a
   * batch nobody asked for.
   */
  requirement?: Requirement;
}) {
  const editing = requirement !== undefined;
  return (
    <FormShell
      action={editing ? updateRequirement.bind(null, requirement.requirementId) : createRequirement}
      errorTitle={editing ? "Could not save that requirement" : "Could not log that requirement"}
      submitLabel={editing ? "Save changes" : "Log requirement"}
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
        {editing ? (
          <>
            <ReadOnly label="College" value={requirement.collegeName ?? "—"} />
            <ReadOnly label="Course" value={requirement.courseName ?? "—"} />
          </>
        ) : (
          <>
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
          </>
        )}
        <FormText
          name="expectedHeadcount"
          label="Expected headcount"
          type="number"
          min={1}
          max={10000}
          required
          placeholder="60"
          defaultValue={requirement === undefined ? "" : String(requirement.expectedHeadcount)}
          hint="Their estimate. The batch's seat cap is set when this is confirmed."
        />
        <FormSelect
          name="preferredMode"
          label="Preferred mode"
          defaultValue={requirement?.preferredMode ?? "OFFLINE"}
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
          defaultValue={requirement?.preferredWindowStart?.slice(0, 10) ?? ""}
          hint="When they would like it to run. Not the schedule."
        />
        <FormText
          name="preferredWindowEnd"
          label="Preferred until"
          type="date"
          defaultValue={requirement?.preferredWindowEnd?.slice(0, 10) ?? ""}
        />
        <FormText
          name="discipline"
          label="Discipline"
          defaultValue={requirement?.discipline ?? ""}
          placeholder="B.Tech Computer Science"
          hint="Which of their students this is for."
        />
        {/* Not editable: how a requirement reached us is a fact about the
            moment it arrived, and the update contract omits it. */}
        {editing ? null : (
          <FormText name="source" label="How it reached us" placeholder="Placement cell · email" />
        )}
        <FullWidth>
          <FormTextarea
            name="notes"
            label="Anything they said that matters"
            rows={3}
            defaultValue={requirement?.notes ?? ""}
            placeholder="Wants it before the placement season; two batches if headcount allows."
          />
        </FullWidth>
      </FormSection>
    </FormShell>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-body-sm font-medium text-ink">{label}</span>
      <span className="flex h-12 items-center rounded-tile bg-surface-sunken px-4 text-body text-ink-muted">
        {value}
      </span>
    </div>
  );
}
