"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { Assignment } from "@gurukulam/contracts";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { createAssignment, updateAssignment } from "@/features/batches/server/actions";
import { IDLE, type FormState } from "@/lib/form";

const inputClass =
  "h-12 w-full rounded-tile border border-hairline-strong bg-surface px-4 text-body text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none";
const areaClass =
  "w-full rounded-tile border border-hairline-strong bg-surface px-4 py-3 text-body text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none";

/**
 * Setting work against a delivered session, and correcting it later.
 *
 * One form for both, because the fields are the same and two would drift —
 * the last time a create and an edit form diverged in this codebase, the edit
 * quietly dropped a field every time somebody corrected something else.
 *
 * The SESSION is not a field. An assignment hangs off the delivery it belongs
 * to; moving it to another day would move it away from the students who
 * already have it, which is why the contract omits it from the update too.
 */
export function AssignmentForm({
  sessionId,
  assignment,
}: {
  sessionId: string;
  /** Present when correcting one that already exists. */
  assignment?: Assignment;
}) {
  const editing = assignment !== undefined;
  const action = editing
    ? updateAssignment.bind(null, assignment.assignmentId, sessionId)
    : createAssignment.bind(null, sessionId);
  const [state, submit] = useActionState<FormState, FormData>(action, IDLE);
  const error = (key: string) => state.fields?.[key];

  return (
    <Card>
      <form action={submit} className="flex flex-col gap-6">
        {state.message === undefined ? null : (
          <Alert intent="danger" title="That assignment was not saved">
            {state.message}
          </Alert>
        )}

        <Field
          htmlFor="title"
          label="Title"
          required
          {...(error("title") === undefined ? {} : { error: error("title")! })}
        >
          <input
            id="title"
            name="title"
            className={inputClass}
            defaultValue={assignment?.title ?? ""}
            placeholder="Window functions — practice set"
          />
        </Field>

        <Field
          htmlFor="description"
          label="What it is"
          hint="Shown to the student beside the title. Leave it empty to clear."
          {...(error("description") === undefined ? {} : { error: error("description")! })}
        >
          <textarea
            id="description"
            name="description"
            rows={3}
            className={areaClass}
            defaultValue={assignment?.description ?? ""}
          />
        </Field>

        <Field
          htmlFor="instructions"
          label="Instructions"
          hint="How to do it and how to hand it in."
          {...(error("instructions") === undefined ? {} : { error: error("instructions")! })}
        >
          <textarea
            id="instructions"
            name="instructions"
            rows={5}
            className={areaClass}
            defaultValue={assignment?.instructions ?? ""}
          />
        </Field>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field
            htmlFor="dueAt"
            label="Due"
            hint="Optional. Nothing falls overdue without one."
            {...(error("dueAt") === undefined ? {} : { error: error("dueAt")! })}
          >
            <input
              id="dueAt"
              name="dueAt"
              type="date"
              className={inputClass}
              defaultValue={assignment?.dueAt?.slice(0, 10) ?? ""}
            />
          </Field>

          <Field
            htmlFor="maxMarks"
            label="Marks"
            hint="Optional — nothing grades yet, so this is what a mark will be out of."
            {...(error("maxMarks") === undefined ? {} : { error: error("maxMarks")! })}
          >
            <input
              id="maxMarks"
              name="maxMarks"
              type="number"
              min={1}
              max={1000}
              className={inputClass}
              defaultValue={assignment?.maxMarks ?? ""}
            />
          </Field>
        </div>

        <Field
          htmlFor="attachmentUrl"
          label="Attachment"
          hint="A link to the brief or the data file. Stored as a URL — there is no upload."
          {...(error("attachmentUrl") === undefined ? {} : { error: error("attachmentUrl")! })}
        >
          <input
            id="attachmentUrl"
            name="attachmentUrl"
            type="url"
            className={inputClass}
            defaultValue={assignment?.attachmentUrl ?? ""}
            placeholder="https://…"
          />
        </Field>

        {editing ? (
          <Field
            htmlFor="status"
            label="Status"
            hint="Closing it stops further submissions; what is already handed in stays."
            {...(error("status") === undefined ? {} : { error: error("status")! })}
          >
            <div className="relative">
              <select
                id="status"
                name="status"
                className={`${inputClass} appearance-none`}
                defaultValue={assignment.status}
              >
                <option value="OPEN">Open</option>
                <option value="CLOSED">Closed</option>
              </select>
              <span
                aria-hidden
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink-muted"
              >
                ▾
              </span>
            </div>
          </Field>
        ) : null}

        <div className="flex justify-end border-t border-hairline pt-5">
          <Submit editing={editing} />
        </div>
      </form>
    </Card>
  );
}

function Submit({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : editing ? "Save changes" : "Set the assignment"}
    </Button>
  );
}
