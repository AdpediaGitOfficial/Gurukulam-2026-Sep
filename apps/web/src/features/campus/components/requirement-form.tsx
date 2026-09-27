"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { CampusCourse } from "@gurukulam/contracts";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
import { TextareaField } from "@/components/ui/textarea";
import { raiseRequirement } from "@/features/campus/server/actions";
import { IDLE } from "@/lib/form";

/**
 * Asking for a cohort.
 *
 * ── What is deliberately not on this form ──────────────────────────────
 *
 * A price, a trainer, and exact dates. All three are ours to come back with:
 * the requirement is a demand record, and confirming it is what opens a batch
 * (invariant 14). A form that asked a college to choose a trainer would be
 * offering a decision the product will then refuse.
 *
 * ── Why the window is two loose dates ──────────────────────────────────
 *
 * "Preferred", not booked. A TPO knows the term they want and not the Tuesday,
 * so asking for a precise start would be asking them to invent one — and then
 * to be disappointed by the one we give back.
 */
export function RequirementForm({ courses }: { courses: CampusCourse[] }) {
  const [state, action] = useActionState(raiseRequirement, IDLE);

  return (
    <form action={action} className="flex flex-col gap-5">
      {state.status === "error" && state.message !== undefined ? (
        <Alert intent="danger" title="That request was not sent">
          {state.message}
        </Alert>
      ) : null}

      <SelectField
        id="courseId"
        name="courseId"
        label="What training do you need?"
        placeholder="Choose a course"
        defaultValue=""
        options={courses.map((course) => ({
          value: course.courseId,
          label:
            course.durationHours === null
              ? course.name
              : `${course.name} · ${course.durationHours} hours`,
        }))}
        required
        {...(state.fields?.["courseId"] === undefined ? {} : { error: state.fields["courseId"] })}
      />

      <TextField
        id="expectedHeadcount"
        name="expectedHeadcount"
        label="Roughly how many students?"
        type="number"
        min={1}
        inputMode="numeric"
        hint="An estimate is fine — we confirm the headcount before anything is billed."
        required
        {...(state.fields?.["expectedHeadcount"] === undefined
          ? {}
          : { error: state.fields["expectedHeadcount"] })}
      />

      <SelectField
        id="preferredMode"
        name="preferredMode"
        label="How should it run?"
        defaultValue="OFFLINE"
        options={[
          { value: "OFFLINE", label: "On campus" },
          { value: "ONLINE", label: "Online" },
          { value: "HYBRID", label: "A mix of both" },
        ]}
        {...(state.fields?.["preferredMode"] === undefined
          ? {}
          : { error: state.fields["preferredMode"] })}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          id="preferredWindowStart"
          name="preferredWindowStart"
          label="Not before"
          type="date"
          {...(state.fields?.["preferredWindowStart"] === undefined
            ? {}
            : { error: state.fields["preferredWindowStart"] })}
        />
        <TextField
          id="preferredWindowEnd"
          name="preferredWindowEnd"
          label="Finished by"
          type="date"
          {...(state.fields?.["preferredWindowEnd"] === undefined
            ? {}
            : { error: state.fields["preferredWindowEnd"] })}
        />
      </div>

      <TextField
        id="discipline"
        name="discipline"
        label="Which department or branch?"
        placeholder="Computer Science, 3rd year"
        {...(state.fields?.["discipline"] === undefined
          ? {}
          : { error: state.fields["discipline"] })}
      />

      <TextareaField
        id="notes"
        name="notes"
        label="Anything we should know"
        rows={4}
        hint="Lab access, timetable clashes, a placement deadline you are working to."
        {...(state.fields?.["notes"] === undefined ? {} : { error: state.fields["notes"] })}
      />

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? "Sending…" : "Send this request"}
    </Button>
  );
}
