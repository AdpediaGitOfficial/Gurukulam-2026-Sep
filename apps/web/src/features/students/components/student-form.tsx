"use client";

import Link from "next/link";
import { useState } from "react";
import type { City, College } from "@gurukulam/contracts";

import {
  FormSection,
  FormSelect,
  FormShell,
  FormText,
  FormTextarea,
  FullWidth,
} from "@/components/patterns/form-shell";
import { buttonVariants } from "@/components/ui/button";
import { createStudent } from "@/features/students/server/actions";
import { cn } from "@/lib/cn";

export function StudentForm({
  cities,
  colleges,
}: {
  cities: readonly City[];
  colleges: readonly College[];
}) {
  /**
   * The segment is the first question, because everything downstream turns on
   * it: a retail student is billed individually and may only join retail
   * batches; a college student is billed through their institution and joins
   * only its dedicated ones. Setting a college is what makes intake
   * institutional, so the two cannot be chosen independently.
   */
  const [segment, setSegment] = useState<"RETAIL" | "COLLEGE">("RETAIL");

  return (
    <FormShell
      action={createStudent}
      errorTitle="Could not add that student"
      submitLabel="Add student"
      secondary={
        <Link href="/students" className={buttonVariants({ variant: "secondary" })}>
          Cancel
        </Link>
      }
    >
      <section className="flex flex-col gap-3">
        <h2 className="text-h3 text-ink">Segment</h2>
        <div className="flex w-fit gap-1 rounded-full bg-surface-muted p-1">
          {(["RETAIL", "COLLEGE"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setSegment(value)}
              className={cn(
                "cursor-pointer rounded-full px-5 py-2 text-body-sm font-medium transition-colors",
                segment === value
                  ? "bg-surface text-ink shadow-raised"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              {value === "RETAIL" ? "Retail — walk-in" : "College — institutional"}
            </button>
          ))}
        </div>
        <p className="text-body-sm text-ink-muted">
          {segment === "RETAIL"
            ? "Billed individually, with their own ledger and installment schedule. A retail student has no college and never will."
            : "Billed through the institution's contract, so no individual ledger. They may only join batches dedicated to their college."}
        </p>
      </section>

      <FormSection title="The student">
        <FormText name="firstName" label="First name" required placeholder="Aarav" />
        <FormText name="lastName" label="Last name" placeholder="Menon" />
        <FormText name="email" label="Email address" type="email" required placeholder="aarav@example.com" />
        <FormText name="phone" label="Mobile" placeholder="+91 98470 00000" />
        {segment === "COLLEGE" ? (
          <FormSelect
            name="collegeId"
            label="College"
            required
            placeholder="Select the institution"
            options={colleges.map((college) => ({
              value: college.collegeId,
              label: college.name,
            }))}
          />
        ) : (
          <FormSelect
            name="cityId"
            label="City"
            placeholder="No city"
            options={cities.map((city) => ({ value: city.cityId, label: city.name }))}
          />
        )}
        <FormText name="discipline" label="Degree or stream" placeholder="B.Tech Computer Science" />
        <FormText name="passoutYear" label="Year of passout" type="number" min={1950} max={2100} placeholder="2027" />
        <FormText name="qualification" label="Qualification" placeholder="8.5 CGPA" />
      </FormSection>

      <FormSection
        title="Notes"
        description="Onboarding creates the record only. Course, batch, price, schedule and credentials are all decided at allocation."
      >
        <FullWidth>
          <FormTextarea name="notes" label="Anything worth recording" rows={3} />
        </FullWidth>
      </FormSection>
    </FormShell>
  );
}
