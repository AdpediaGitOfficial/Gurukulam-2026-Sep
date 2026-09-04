"use client";

import Link from "next/link";
import {
  formatRupees,
  fromWire,
  type City,
  type Course,
  type TrainerDetail,
} from "@gurukulam/contracts";

import {
  FormSection,
  FormSelect,
  FormShell,
  FormText,
  FullWidth,
} from "@/components/patterns/form-shell";
import { buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { saveTrainer } from "@/features/trainers/server/actions";

export function TrainerForm({
  cities,
  courses,
  trainer,
}: {
  cities: readonly City[];
  courses: readonly Course[];
  trainer?: TrainerDetail;
}) {
  const editing = trainer !== undefined;
  const approved = new Set(trainer?.approvedCourses.map((course) => course.courseId));

  return (
    <FormShell
      action={saveTrainer.bind(null, trainer?.trainerId)}
      errorTitle={editing ? "Could not save that trainer" : "Could not add that trainer"}
      submitLabel={editing ? "Save changes" : "Add trainer"}
      secondary={
        <Link href="/trainers" className={buttonVariants({ variant: "secondary" })}>
          Cancel
        </Link>
      }
    >
      <FormSection title="The trainer">
        <FormText
          name="name"
          label="Full name"
          required
          placeholder="Ravi Shankar"
          defaultValue={trainer?.name}
        />
        <FormText
          name="email"
          label="Email address"
          type="email"
          required
          placeholder="ravi@example.com"
          defaultValue={trainer?.email}
        />
        <FormText
          name="phone"
          label="Phone"
          placeholder="+91 98470 00000"
          defaultValue={trainer?.phone ?? ""}
        />
        <FormText
          name="qualification"
          label="Highest qualification"
          placeholder="M.Tech Data Science"
          defaultValue={trainer?.qualification ?? ""}
        />
        <FormText
          name="experienceYears"
          label="Years of experience"
          type="number"
          min={0}
          max={70}
          defaultValue={trainer?.experienceYears ?? ""}
        />
        <FormSelect
          name="cityId"
          label="Based in"
          placeholder="No city"
          defaultValue={trainer?.cityId ?? ""}
          options={cities.map((city) => ({ value: city.cityId, label: city.name }))}
        />
        {editing ? (
          <FormSelect
            name="accountStatus"
            label="Account status"
            required
            defaultValue={trainer.accountStatus}
            hint="Only an active trainer appears in the batch picker."
            options={[
              { value: "ACTIVE", label: "Active" },
              { value: "INACTIVE", label: "Inactive" },
              { value: "SUSPENDED", label: "Suspended" },
            ]}
          />
        ) : null}
        <FullWidth>
          <FormText
            name="skillTags"
            label="Skills"
            placeholder="Python, SQL, Power BI"
            hint="Comma separated."
            defaultValue={trainer?.skillTags.join(", ")}
          />
        </FullWidth>
      </FormSection>

      <FormSection title="Engagement">
        <FormSelect
          name="payModel"
          label="Pay model"
          placeholder="Not set"
          defaultValue={trainer?.payModel ?? ""}
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
          defaultValue={
            trainer?.payRateMinor == null
              ? ""
              : formatRupees(fromWire(trainer.payRateMinor), { symbol: false })
          }
        />
        <FormText
          name="maxWeeklyHours"
          label="Max weekly hours"
          type="number"
          min={1}
          max={80}
          placeholder="40"
          defaultValue={trainer?.maxWeeklyHours ?? ""}
        />
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
                  defaultChecked={approved.has(course.courseId)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </FormShell>
  );
}
