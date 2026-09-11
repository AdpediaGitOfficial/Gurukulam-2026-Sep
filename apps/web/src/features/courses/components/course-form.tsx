"use client";

import Link from "next/link";
import { useState } from "react";
import { formatRupees, fromWire, type CourseDetail } from "@gurukulam/contracts";

import {
  FormSection,
  FormShell,
  FormSwitch,
  FormText,
  FormTextarea,
  FullWidth,
} from "@/components/patterns/form-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { saveCourse } from "@/features/courses/server/actions";
import { serialiseTopics } from "@/features/courses/topics";
import { TextField } from "@/components/ui/input";

interface TopicRow {
  id: number;
  title: string;
  hours: string;
}

export function CourseForm({ course }: { course?: CourseDetail }) {
  const editing = course !== undefined;

  const initial: TopicRow[] =
    course === undefined || course.topics.length === 0
      ? [{ id: 0, title: "", hours: "" }]
      : course.topics.map((topic, index) => ({
          id: index,
          title: topic.title,
          hours: topic.durationHours === null ? "" : String(topic.durationHours),
        }));

  const [nextId, setNextId] = useState(initial.length);
  const [topics, setTopics] = useState<TopicRow[]>(initial);

  return (
    <FormShell
      action={saveCourse.bind(null, course?.courseId)}
      errorTitle={editing ? "Could not save that course" : "Could not add that course"}
      submitLabel={editing ? "Save changes" : "Add course"}
      secondary={
        <Link href="/courses" className={buttonVariants({ variant: "secondary" })}>
          Cancel
        </Link>
      }
    >
      {/* The topic list as it was when this page loaded. The action compares
          the submission against it and only replaces the topics when they
          actually changed — replacement re-issues every topic id. */}
      {editing ? (
        <input
          type="hidden"
          name="topicsSnapshot"
          value={serialiseTopics(course.topics)}
        />
      ) : null}
      <FormSection title="The course">
        <FormText
          name="name"
          label="Course name"
          required
          placeholder="Data Analytics Masterclass"
          defaultValue={course?.name}
        />
        <FormText
          name="shortName"
          label="Short name"
          placeholder="DA"
          hint="Feeds the batch code."
          defaultValue={course?.shortName ?? ""}
        />
        <FormText
          name="category"
          label="Category"
          placeholder="Data Science"
          defaultValue={course?.category ?? ""}
        />
        <FormText
          name="standardMarketValue"
          label="Standard market value (₹)"
          required
          inputMode="decimal"
          placeholder="75000"
          hint="The catalogue price. A retail enrolment can be pitched below it."
          className="font-mono tabular-nums"
          defaultValue={
            course === undefined
              ? undefined
              : formatRupees(fromWire(course.standardMarketValueMinor), { symbol: false })
          }
        />
        <FormText
          name="durationWeeks"
          label="Duration (weeks)"
          type="number"
          min={0}
          placeholder="12"
          defaultValue={course?.durationWeeks ?? ""}
        />
        <FormText
          name="durationHours"
          label="Duration (hours)"
          type="number"
          min={0}
          placeholder="96"
          defaultValue={course?.durationHours ?? ""}
        />
        <FormText
          name="attendanceFloorPct"
          label="Attendance floor (%)"
          type="number"
          min={0}
          max={100}
          placeholder="75"
          hint="Below this, a student is not certificate-eligible."
          defaultValue={course?.attendanceFloorPct ?? ""}
        />
        <FormText
          name="syllabusUrl"
          label="Syllabus URL"
          type="url"
          placeholder="https://…"
          defaultValue={course?.syllabusUrl ?? ""}
        />
        <FullWidth>
          <FormTextarea
            name="description"
            label="Description"
            rows={3}
            placeholder="What this course covers and who it is for…"
            defaultValue={course?.description ?? ""}
          />
        </FullWidth>
        {editing ? (
          <FullWidth>
            <FormSwitch
              name="isActive"
              label="Active"
              hint="Archiving takes the course out of the pickers. Batches already running keep it."
              defaultChecked={course.isActive}
            />
          </FullWidth>
        ) : null}
      </FormSection>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-h3 text-ink">Topics</h2>
            <p className="mt-1 text-body-sm text-ink-muted">
              A course holds topics; each topic carries one or more sessions. Sessions are scheduled
              per batch, so only the structure is set here.
              {editing
                ? " Changing this list replaces it wholesale — sessions already scheduled against a topic keep the title they were given."
                : ""}
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
