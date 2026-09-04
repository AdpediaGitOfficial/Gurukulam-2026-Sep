"use client";

import Link from "next/link";
import type { City, Course } from "@gurukulam/contracts";

import {
  FormSection,
  FormSelect,
  FormShell,
  FormText,
  FullWidth,
} from "@/components/patterns/form-shell";
import { buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { createTrainer } from "@/features/trainers/server/actions";

export function TrainerForm({
  cities,
  courses,
}: {
  cities: readonly City[];
  courses: readonly Course[];
}) {
  return (
    <FormShell
      action={createTrainer}
      errorTitle="Could not add that trainer"
      submitLabel="Add trainer"
      secondary={
        <Link href="/trainers" className={buttonVariants({ variant: "secondary" })}>
          Cancel
        </Link>
      }
    >
      <FormSection title="The trainer">
        <FormText name="name" label="Full name" required placeholder="Ravi Shankar" />
        <FormText name="email" label="Email address" type="email" required placeholder="ravi@example.com" />
        <FormText name="phone" label="Phone" placeholder="+91 98470 00000" />
        <FormText name="qualification" label="Highest qualification" placeholder="M.Tech Data Science" />
        <FormText name="experienceYears" label="Years of experience" type="number" min={0} max={70} />
        <FormSelect
          name="cityId"
          label="Based in"
          placeholder="No city"
          options={cities.map((city) => ({ value: city.cityId, label: city.name }))}
        />
        <FullWidth>
          <FormText
            name="skillTags"
            label="Skills"
            placeholder="Python, SQL, Power BI"
            hint="Comma separated."
          />
        </FullWidth>
      </FormSection>

      <FormSection title="Engagement">
        <FormSelect
          name="payModel"
          label="Pay model"
          placeholder="Not set"
          options={[
            { value: "PER_HOUR", label: "Per hour" },
            { value: "PER_SESSION", label: "Per session" },
            { value: "MONTHLY", label: "Monthly" },
            { value: "PER_BATCH", label: "Per batch" },
          ]}
        />
        <FormText
          name="payRate"
          label="Rate (₹)"
          inputMode="decimal"
          placeholder="2400"
          className="font-mono tabular-nums"
        />
        <FormText name="maxWeeklyHours" label="Max weekly hours" type="number" min={1} max={80} placeholder="40" />
      </FormSection>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-h3 text-ink">Approved courses</h2>
          <p className="mt-1 text-body-sm text-ink-muted">
            This mapping is what makes a trainer assignable — a batch may only be given to someone
            approved for its course. A trainer with none cannot be assigned to anything yet.
          </p>
        </div>

        {courses.length === 0 ? (
          <p className="text-body-sm text-ink-subtle">
            There are no courses yet. Approvals can be granted once there are.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {courses.map((course) => (
              <li key={course.courseId}>
                <Checkbox
                  id={`course-${course.courseId}`}
                  name="courseIds"
                  value={course.courseId}
                  label={course.name}
                  hint={course.courseCode}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </FormShell>
  );
}
