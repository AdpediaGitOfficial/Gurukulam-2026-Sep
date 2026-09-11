"use client";

import Link from "next/link";
import { useState } from "react";
import type { Course } from "@gurukulam/contracts";

import {
  FormSection,
  FormSelect,
  FormShell,
  FormText,
  FormTextarea,
  FullWidth,
} from "@/components/patterns/form-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SelectField } from "@/components/ui/select";
import { TextField } from "@/components/ui/input";
import { createJob } from "@/features/hiring/server/actions";

interface RuleRow {
  id: number;
  courseId: string;
  segment: string;
  passoutYear: string;
  completedOnly: boolean;
}

/**
 * Posting a role, and deciding who sees it.
 *
 * Course is the primary targeting axis, because that is the question a
 * recruiter is actually asking: who has been taught this. Everything else
 * narrows it.
 *
 * The audience is evaluated when the posting is READ, never written out per
 * student — so a rule set today keeps matching students who enrol next month,
 * and moving a student between batches cannot leave them holding a posting
 * they should no longer see.
 */
export function JobForm({ courses }: { courses: readonly Course[] }) {
  const [rules, setRules] = useState<RuleRow[]>([
    { id: 0, courseId: "", segment: "", passoutYear: "", completedOnly: false },
  ]);
  const [nextId, setNextId] = useState(1);

  const set = (id: number, patch: Partial<RuleRow>) =>
    setRules((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <FormShell
      action={createJob}
      errorTitle="Could not create that posting"
      submitLabel="Save as draft"
      secondary={
        <Link href="/hiring" className={buttonVariants({ variant: "secondary" })}>
          Cancel
        </Link>
      }
    >
      <FormSection title="The role">
        <FormText
          name="roleTitle"
          label="Role title"
          required
          placeholder="Junior Data Analyst"
        />
        <FormText name="companyName" label="Company" required placeholder="Kochi Analytics Ltd" />
        <FormText name="location" label="Location" placeholder="Kochi" />
        <FormSelect
          name="workMode"
          label="Work mode"
          defaultValue="ONSITE"
          options={[
            { value: "ONSITE", label: "On site" },
            { value: "REMOTE", label: "Remote" },
            { value: "HYBRID", label: "Hybrid" },
          ]}
        />
        <FormText
          name="experienceMinYears"
          label="Experience from (years)"
          type="number"
          min={0}
          max={50}
          placeholder="0"
        />
        <FormText
          name="experienceMaxYears"
          label="Experience to (years)"
          type="number"
          min={0}
          max={50}
          placeholder="2"
        />
        <FullWidth>
          <FormText
            name="skills"
            label="Skills"
            placeholder="SQL, Python, Power BI"
            hint="Comma separated. Shown on the posting; targeting is by course, not by these."
          />
        </FullWidth>
        <FullWidth>
          <FormTextarea
            name="description"
            label="Description"
            rows={4}
            placeholder="What the role involves, and what they are looking for…"
          />
        </FullWidth>
      </FormSection>

      <FormSection
        title="Money and applying"
        description="Compensation is stored in paise from what you type here — never as a float."
      >
        <FormText
          name="compensationMin"
          label="Compensation from (₹)"
          inputMode="decimal"
          placeholder="600000"
          className="font-mono tabular-nums"
        />
        <FormText
          name="compensationMax"
          label="Compensation to (₹)"
          inputMode="decimal"
          placeholder="900000"
          className="font-mono tabular-nums"
        />
        <FormSelect
          name="compensationPeriod"
          label="Per"
          placeholder="Not stated"
          options={[
            { value: "ANNUAL", label: "Year" },
            { value: "MONTHLY", label: "Month" },
          ]}
        />
        <FormText name="closingDate" label="Closes on" type="date" />
        <FormText
          name="applyUrl"
          label="Apply at"
          type="url"
          placeholder="https://…"
          hint="A link, an address, or both."
        />
        <FormText
          name="applyEmail"
          label="Or apply by email"
          type="email"
          placeholder="careers@example.com"
        />
      </FormSection>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-h3 text-ink">Who sees it</h2>
            <p className="mt-1 max-w-2xl text-body-sm text-ink-muted">
              One rule per course. A posting with no rule reaches nobody — which is a draft worth
              saving, but not one worth publishing.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setRules((rows) => [
                ...rows,
                { id: nextId, courseId: "", segment: "", passoutYear: "", completedOnly: false },
              ]);
              setNextId((n) => n + 1);
            }}
          >
            Add a course
          </Button>
        </div>

        <ul className="flex flex-col gap-4">
          {rules.map((rule, index) => (
            <li key={rule.id} className="flex flex-col gap-4 rounded-tile border border-hairline p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-caption font-bold tracking-wide text-ink-subtle uppercase">
                  Rule {index + 1}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={rules.length === 1}
                  onClick={() => setRules((rows) => rows.filter((r) => r.id !== rule.id))}
                >
                  Remove
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <SelectField
                  id={`ruleCourseId-${rule.id}`}
                  name="ruleCourseId"
                  label="Students who took"
                  placeholder="Choose a course"
                  value={rule.courseId}
                  onChange={(event) => set(rule.id, { courseId: event.target.value })}
                  options={courses.map((course) => ({
                    value: course.courseId,
                    label: course.name,
                  }))}
                />
                <SelectField
                  id={`ruleSegment-${rule.id}`}
                  name="ruleSegment"
                  label="Segment"
                  placeholder="Retail and college"
                  value={rule.segment}
                  onChange={(event) => set(rule.id, { segment: event.target.value })}
                  options={[
                    { value: "RETAIL", label: "Retail only" },
                    { value: "COLLEGE", label: "College only" },
                  ]}
                />
                <TextField
                  id={`rulePassoutYear-${rule.id}`}
                  name="rulePassoutYear"
                  label="Passout year"
                  type="number"
                  min={1950}
                  max={2100}
                  placeholder="Any"
                  value={rule.passoutYear}
                  onChange={(event) => set(rule.id, { passoutYear: event.target.value })}
                />
              </div>

              {/* Always present, so each row's answer lines up with its course
                  in the submitted arrays. An unchecked checkbox is simply
                  absent, which would shift every row after it. */}
              <input
                type="hidden"
                name="ruleCompletedOnly"
                value={rule.completedOnly ? "on" : "off"}
              />
              <Checkbox
                id={`ruleCompleted-${rule.id}`}
                label="Only those who completed the course"
                hint="Otherwise anyone enrolled on it, finished or not."
                checked={rule.completedOnly}
                onChange={(event) => set(rule.id, { completedOnly: event.target.checked })}
              />
            </li>
          ))}
        </ul>
      </section>
    </FormShell>
  );
}
