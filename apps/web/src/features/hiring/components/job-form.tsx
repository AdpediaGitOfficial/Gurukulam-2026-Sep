"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { formatRupees, fromWire, type Course, type JobPosting } from "@gurukulam/contracts";

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
import { createJob, previewReach, updateJob } from "@/features/hiring/server/actions";

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
/**
 * One form, two verbs. Editing a posting is the same decision as creating one
 * — what the role is, and who should see it — so a second component would be
 * two places to keep a targeting rule correct, and they would drift.
 */
export function JobForm({ courses, job }: { courses: readonly Course[]; job?: JobPosting }) {
  const editing = job !== undefined;
  /** Paise on the record, rupees in the field — and never through a float. */
  const rupees = (minor: string | null | undefined): string =>
    minor === null || minor === undefined ? "" : formatRupees(fromWire(minor), { symbol: false, paise: false });
  const existing: RuleRow[] = (job?.audienceRules ?? []).map((rule, index) => ({
    id: index,
    courseId: rule.courseId,
    segment: rule.segment ?? "",
    passoutYear: rule.passoutYear === null ? "" : String(rule.passoutYear),
    completedOnly: rule.completedOnly,
  }));
  const [rules, setRules] = useState<RuleRow[]>(
    existing.length > 0
      ? existing
      : [{ id: 0, courseId: "", segment: "", passoutYear: "", completedOnly: false }],
  );
  const [nextId, setNextId] = useState(existing.length > 0 ? existing.length : 1);

  const set = (id: number, patch: Partial<RuleRow>) =>
    setRules((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <FormShell
      action={editing ? updateJob.bind(null, job.jobPostingId) : createJob}
      errorTitle={editing ? "Could not save that posting" : "Could not create that posting"}
      submitLabel={editing ? "Save changes" : "Save as draft"}
      secondary={
        <Link href="/hiring" className={buttonVariants({ variant: "secondary" })}>
          Cancel
        </Link>
      }
    >
      <FormSection title="The role">
        <FormText
          name="roleTitle"
          defaultValue={job?.roleTitle}
          label="Role title"
          required
          placeholder="Junior Data Analyst"
        />
        <FormText name="companyName"
          defaultValue={job?.companyName} label="Company" required placeholder="Kochi Analytics Ltd" />
        <FormText name="location"
          defaultValue={job?.location ?? ""} label="Location" placeholder="Kochi" />
        <FormSelect
          name="workMode"
          label="Work mode"
          defaultValue={job?.workMode ?? "ONSITE"}
          options={[
            { value: "ONSITE", label: "On site" },
            { value: "REMOTE", label: "Remote" },
            { value: "HYBRID", label: "Hybrid" },
          ]}
        />
        <FormText
          name="experienceMinYears"
          defaultValue={job?.experienceMinYears === null || job?.experienceMinYears === undefined ? "" : String(job.experienceMinYears)}
          label="Experience from (years)"
          type="number"
          min={0}
          max={50}
          placeholder="0"
        />
        <FormText
          name="experienceMaxYears"
          defaultValue={job?.experienceMaxYears === null || job?.experienceMaxYears === undefined ? "" : String(job.experienceMaxYears)}
          label="Experience to (years)"
          type="number"
          min={0}
          max={50}
          placeholder="2"
        />
        <FullWidth>
          <FormText
            name="skills"
          defaultValue={(job?.skills ?? []).join(", ")}
            label="Skills"
            placeholder="SQL, Python, Power BI"
            hint="Comma separated. Shown on the posting; targeting is by course, not by these."
          />
        </FullWidth>
        <FullWidth>
          <FormTextarea
            name="description"
          defaultValue={job?.description ?? ""}
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
          defaultValue={rupees(job?.compensationMinMinor)}
          label="Compensation from (₹)"
          inputMode="decimal"
          placeholder="600000"
          className="font-mono tabular-nums"
        />
        <FormText
          name="compensationMax"
          defaultValue={rupees(job?.compensationMaxMinor)}
          label="Compensation to (₹)"
          inputMode="decimal"
          placeholder="900000"
          className="font-mono tabular-nums"
        />
        <FormSelect
          name="compensationPeriod"
          defaultValue={job?.compensationPeriod === "MONTHLY" ? "MONTHLY" : "ANNUAL"}
          label="Per"
          placeholder="Not stated"
          options={[
            { value: "ANNUAL", label: "Year" },
            { value: "MONTHLY", label: "Month" },
          ]}
        />
        <FormText name="closingDate"
          defaultValue={job?.closingDate?.slice(0, 10) ?? ""} label="Closes on" type="date" />
        <FormText
          name="applyUrl"
          defaultValue={job?.applyUrl ?? ""}
          label="Apply at"
          type="url"
          placeholder="https://…"
          hint="A link, an address, or both."
        />
        <FormText
          name="applyEmail"
          defaultValue={job?.applyEmail ?? ""}
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

        {/* The number, before the posting exists. A recruiter composing
            "Data Analytics, college segment, 2025 passouts" is guessing at who
            that comes to; this replaces the guess while the rules can still be
            changed. It is a READ — it publishes nothing and saves nothing. */}
        <ReachPreview rules={rules} />
      </section>
    </FormShell>
  );
}

function ReachPreview({ rules }: { rules: readonly RuleRow[] }) {
  const [reach, setReach] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [pending, startTransition] = useTransition();

  const usable = rules.filter((rule) => rule.courseId !== "").length;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-hairline pt-4">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={pending || usable === 0}
        onClick={() =>
          startTransition(async () => {
            const result = await previewReach(
              rules.map((rule) => ({
                courseId: rule.courseId,
                segment: rule.segment,
                ...(rule.passoutYear === "" ? {} : { passoutYear: Number(rule.passoutYear) }),
                completedOnly: rule.completedOnly,
              })),
            );
            setReach(result);
            setChecked(true);
          })
        }
      >
        {pending ? "Checking…" : "Who does this reach?"}
      </Button>

      <p className="text-body-sm text-ink-muted">
        {usable === 0 ? (
          "Every rule starts from a course — pick one to check the reach."
        ) : !checked ? (
          "Counted live, so a rule set today keeps matching students who enrol next month."
        ) : reach === null ? (
          "That could not be checked. The rules are unchanged."
        ) : (
          <>
            <span className="font-semibold tabular-nums text-ink">{reach}</span>{" "}
            {reach === 1 ? "student matches" : "students match"} these rules right now.
          </>
        )}
      </p>
    </div>
  );
}
