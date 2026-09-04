"use client";

import Link from "next/link";
import { useState } from "react";
import type { City, College, StudentDetail } from "@gurukulam/contracts";

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
import { saveStudent } from "@/features/students/server/actions";
import { cn } from "@/lib/cn";

export function StudentForm({
  cities,
  colleges,
  student,
}: {
  cities: readonly City[];
  colleges: readonly College[];
  student?: StudentDetail;
}) {
  const editing = student !== undefined;

  /**
   * The segment is the first question, because everything downstream turns on
   * it: a retail student is billed individually and may only join retail
   * batches; a college student is billed through their institution and joins
   * only its dedicated ones. Setting a college is what makes intake
   * institutional, so the two cannot be chosen independently.
   */
  const [segment, setSegment] = useState<"RETAIL" | "COLLEGE">(
    student?.enrolmentChannel ?? "RETAIL",
  );

  return (
    <FormShell
      action={saveStudent.bind(null, student?.studentId)}
      errorTitle={editing ? "Could not save that student" : "Could not add that student"}
      submitLabel={editing ? "Save changes" : "Add student"}
      secondary={
        <Link
          href={editing ? `/students/${student.studentId}` : "/students"}
          className={buttonVariants({ variant: "secondary" })}
        >
          Cancel
        </Link>
      }
    >
      {editing ? null : (
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
      )}

      <FormSection title="The student">
        <FormText
          name="firstName"
          label="First name"
          required
          placeholder="Aarav"
          defaultValue={student?.firstName}
        />
        <FormText
          name="lastName"
          label="Last name"
          placeholder="Menon"
          defaultValue={student?.lastName ?? ""}
        />
        <FormText
          name="email"
          label="Email address"
          type="email"
          required
          placeholder="aarav@example.com"
          defaultValue={student?.email}
        />
        <FormText
          name="phone"
          label="Mobile"
          placeholder="+91 98470 00000"
          defaultValue={student?.phone ?? ""}
        />
        {editing ? (
          <FormText
            name="altPhone"
            label="Alternate phone"
            placeholder="+91 98470 00001"
            defaultValue={student.altPhone ?? ""}
          />
        ) : null}
        {/* Segment is fixed once the record exists. A retail student is billed
            individually and a college student through their institution, so
            moving between them would strand a ledger or create one that
            invariant 3 says may not exist. Shown, not hidden. */}
        {editing ? (
          <LockedField
            label="Segment"
            value={
              student.enrolmentChannel === "RETAIL"
                ? "Retail — walk-in"
                : `College — ${student.collegeName ?? "institutional"}`
            }
            reason="Billing and roster eligibility both follow from this, so it is fixed at onboarding."
          />
        ) : segment === "COLLEGE" ? (
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
        ) : null}
        {editing || segment === "RETAIL" ? (
          <FormSelect
            name="cityId"
            label="City"
            placeholder="No city"
            defaultValue={student?.cityId ?? ""}
            options={cities.map((city) => ({ value: city.cityId, label: city.name }))}
          />
        ) : null}
        <FormText
          name="discipline"
          label="Degree or stream"
          placeholder="B.Tech Computer Science"
          defaultValue={student?.discipline ?? ""}
        />
        <FormText
          name="passoutYear"
          label="Year of passout"
          type="number"
          min={1950}
          max={2100}
          placeholder="2027"
          defaultValue={student?.passoutYear ?? ""}
        />
        <FormText
          name="qualification"
          label="Qualification"
          placeholder="8.5 CGPA"
          defaultValue={student?.qualification ?? ""}
        />
        {editing ? (
          <>
            <FullWidth>
              <FormText
                name="addressLine1"
                label="Address"
                placeholder="Street address"
                defaultValue={student.addressLine1 ?? ""}
              />
            </FullWidth>
            <FormText
              name="addressLine2"
              label="Address, second line"
              placeholder="Area, landmark"
              defaultValue={student.addressLine2 ?? ""}
            />
            <FormText
              name="postalCode"
              label="Postal code"
              placeholder="682021"
              defaultValue={student.postalCode ?? ""}
            />
          </>
        ) : null}
      </FormSection>

      <FormSection
        title="Notes"
        description={
          editing
            ? "Enrolment, pricing and credentials live on the student's own page — this screen is their personal details."
            : "Onboarding creates the record only. Course, batch, price, schedule and credentials are all decided at allocation."
        }
      >
        <FullWidth>
          <FormTextarea
            name="notes"
            label="Anything worth recording"
            rows={3}
            defaultValue={student?.notes ?? ""}
          />
        </FullWidth>
      </FormSection>
    </FormShell>
  );
}
