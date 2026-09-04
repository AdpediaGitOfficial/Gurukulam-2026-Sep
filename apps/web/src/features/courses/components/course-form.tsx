"use client";

import Link from "next/link";
import { useState } from "react";

import {
  FormSection,
  FormShell,
  FormText,
  FormTextarea,
  FullWidth,
} from "@/components/patterns/form-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { createCourse } from "@/features/courses/server/actions";
import { TextField } from "@/components/ui/input";

interface TopicRow {
  id: number;
  title: string;
  hours: string;
}

export function CourseForm() {
  const [nextId, setNextId] = useState(1);
  const [topics, setTopics] = useState<TopicRow[]>([{ id: 0, title: "", hours: "" }]);

  return (
    <FormShell
      action={createCourse}
      errorTitle="Could not add that course"
      submitLabel="Add course"
      secondary={
        <Link href="/courses" className={buttonVariants({ variant: "secondary" })}>
          Cancel
        </Link>
      }
    >
      <FormSection title="The course">
        <FormText name="name" label="Course name" required placeholder="Data Analytics Masterclass" />
        <FormText name="shortName" label="Short name" placeholder="DA" hint="Feeds the batch code." />
        <FormText name="category" label="Category" placeholder="Data Science" />
        <FormText
          name="standardMarketValue"
          label="Standard market value (₹)"
          required
          inputMode="decimal"
          placeholder="75000"
          hint="The catalogue price. A retail enrolment can be pitched below it."
          className="font-mono tabular-nums"
        />
        <FormText name="durationWeeks" label="Duration (weeks)" type="number" min={0} placeholder="12" />
        <FormText name="durationHours" label="Duration (hours)" type="number" min={0} placeholder="96" />
        <FormText
          name="attendanceFloorPct"
          label="Attendance floor (%)"
          type="number"
          min={0}
          max={100}
          placeholder="75"
          hint="Below this, a student is not certificate-eligible."
        />
        <FormText name="syllabusUrl" label="Syllabus URL" type="url" placeholder="https://…" />
        <FullWidth>
          <FormTextarea
            name="description"
            label="Description"
            rows={3}
            placeholder="What this course covers and who it is for…"
          />
        </FullWidth>
      </FormSection>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-h3 text-ink">Topics</h2>
            <p className="mt-1 text-body-sm text-ink-muted">
              A course holds topics; each topic carries one or more sessions. Sessions are scheduled
              per batch, so only the structure is set here.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setTopics((rows) => [...rows, { id: nextId, title: "", hours: "" }]);
              setNextId((id) => id + 1);
            }}
          >
            Add topic
          </Button>
        </div>

        <ul className="flex flex-col gap-3">
          {topics.map((topic, index) => (
            <li key={topic.id} className="flex flex-wrap items-end gap-3">
              <span className="w-6 pb-3 font-mono text-body-sm text-ink-subtle">{index + 1}</span>
              <TextField
                id={`topicTitle-${topic.id}`}
                name="topicTitle"
                label="Topic title"
                hideLabel={index > 0}
                value={topic.title}
                onChange={(event) =>
                  setTopics((rows) =>
                    rows.map((r) => (r.id === topic.id ? { ...r, title: event.target.value } : r)),
                  )
                }
                placeholder="SQL for Analysts"
                fieldClassName="min-w-56 flex-1"
              />
              <TextField
                id={`topicHours-${topic.id}`}
                name="topicHours"
                label="Hours"
                hideLabel={index > 0}
                type="number"
                min={0}
                value={topic.hours}
                onChange={(event) =>
                  setTopics((rows) =>
                    rows.map((r) => (r.id === topic.id ? { ...r, hours: event.target.value } : r)),
                  )
                }
                fieldClassName="w-28"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={topics.length === 1}
                onClick={() => setTopics((rows) => rows.filter((r) => r.id !== topic.id))}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </FormShell>
  );
}
