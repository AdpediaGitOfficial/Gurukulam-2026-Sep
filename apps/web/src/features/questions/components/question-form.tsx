"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { Question } from "@gurukulam/contracts";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { createQuestion, updateQuestion } from "@/features/questions/server/actions";
import { IDLE, type FormState } from "@/lib/form";

const inputClass =
  "h-12 w-full rounded-tile border border-hairline-strong bg-surface px-4 text-body text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none";
const areaClass =
  "w-full rounded-tile border border-hairline-strong bg-surface px-4 py-3 text-body text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none";

export interface CourseOption {
  courseId: string;
  name: string;
}

const TYPES = [
  { value: "MCQ_SINGLE", label: "Multiple choice — one answer" },
  { value: "MCQ_MULTI", label: "Multiple choice — several answers" },
  { value: "TRUE_FALSE", label: "True or false" },
  { value: "SHORT_ANSWER", label: "Short answer" },
  { value: "DESCRIPTIVE", label: "Descriptive" },
] as const;

type Row = { key: string; text: string };

const LETTERS = "ABCDEFGHIJ";

/**
 * Writing a question, and correcting one.
 *
 * The shape of the form follows the TYPE, because the five types genuinely
 * need different things: a descriptive question has no options and marking one
 * "correct" is meaningless, while a multiple-choice one is nothing without
 * them. Showing every field for every type would invite filling in answers
 * that are then silently discarded.
 *
 * The failure this is most careful about is the quiet one: a correct answer
 * that does not match any option key. The question looks perfect in the bank
 * and every attempt at it is marked wrong. So the answers are CHECKBOXES over
 * the options themselves rather than a typed field — you cannot name an option
 * that is not there.
 */
export function QuestionForm({
  courses,
  question,
}: {
  courses: readonly CourseOption[];
  /** Present when correcting one that already exists. */
  question?: Question;
}) {
  const editing = question !== undefined;
  const action = editing ? updateQuestion.bind(null, question.questionId) : createQuestion;
  const [state, submit] = useActionState<FormState, FormData>(action, IDLE);

  const [type, setType] = useState<string>(question?.questionType ?? "MCQ_SINGLE");
  const [rows, setRows] = useState<Row[]>(
    question?.options?.map((o) => ({ key: o.key, text: o.text })) ?? [
      { key: "A", text: "" },
      { key: "B", text: "" },
    ],
  );
  const [correct, setCorrect] = useState<string[]>(question?.correctAnswers ?? []);

  const needsOptions = type === "MCQ_SINGLE" || type === "MCQ_MULTI";
  const isTrueFalse = type === "TRUE_FALSE";
  const error = (key: string) => state.fields?.[key];

  const setRow = (index: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const addRow = () =>
    setRows((current) => [
      ...current,
      { key: LETTERS[current.length] ?? String(current.length + 1), text: "" },
    ]);

  const removeRow = (index: number) =>
    setRows((current) => {
      const row = current[index];
      // Dropping an option that is marked correct must drop the mark with it,
      // or the question is saved with an answer pointing at nothing.
      if (row !== undefined) setCorrect((keys) => keys.filter((k) => k !== row.key));
      return current.filter((_, i) => i !== index);
    });

  const toggleCorrect = (key: string) =>
    setCorrect((current) =>
      type === "MCQ_SINGLE"
        ? [key]
        : current.includes(key)
          ? current.filter((k) => k !== key)
          : [...current, key],
    );

  return (
    <Card>
      <form action={submit} className="flex flex-col gap-6">
        {state.message === undefined ? null : (
          <Alert intent="danger" title="That question was not saved">
            {state.message}
          </Alert>
        )}

        <div className="grid gap-6 sm:grid-cols-2">
          <Field
            htmlFor="courseId"
            label="Course"
            required
            hint="Assessment belongs to a course, which is why the bank lives under Courses."
            {...(error("courseId") === undefined ? {} : { error: error("courseId")! })}
          >
            <Select id="courseId" name="courseId" defaultValue={question?.courseId ?? ""}>
              <option value="" disabled>
                Choose a course…
              </option>
              {courses.map((course) => (
                <option key={course.courseId} value={course.courseId}>
                  {course.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            htmlFor="questionType"
            label="Type"
            required
            {...(error("questionType") === undefined ? {} : { error: error("questionType")! })}
          >
            <Select
              id="questionType"
              name="questionType"
              value={type}
              onChange={(event) => {
                setType(event.target.value);
                // Answers from the previous type never carry over — "TRUE" is
                // not an option key, and an option key is not TRUE or FALSE.
                setCorrect([]);
              }}
            >
              {TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field
          htmlFor="questionText"
          label="The question"
          required
          {...(error("questionText") === undefined ? {} : { error: error("questionText")! })}
        >
          <textarea
            id="questionText"
            name="questionText"
            rows={3}
            className={areaClass}
            defaultValue={question?.questionText ?? ""}
            placeholder="Which window function returns a rank with no gaps?"
          />
        </Field>

        {needsOptions ? (
          <fieldset className="flex flex-col gap-3">
            <legend className="text-body-sm font-medium text-ink">
              Options
              <span className="ml-2 font-normal text-ink-muted">
                Tick the {type === "MCQ_SINGLE" ? "correct one" : "correct ones"}.
              </span>
            </legend>
            {error("options") === undefined ? null : (
              <p className="text-caption text-danger">{error("options")}</p>
            )}
            {error("correctAnswers") === undefined ? null : (
              <p className="text-caption text-danger">{error("correctAnswers")}</p>
            )}

            {rows.map((row, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type={type === "MCQ_SINGLE" ? "radio" : "checkbox"}
                  name="correct"
                  value={row.key}
                  checked={correct.includes(row.key)}
                  onChange={() => toggleCorrect(row.key)}
                  aria-label={`Option ${row.key} is correct`}
                  className="size-4 shrink-0 accent-brand"
                />
                <input
                  name="optionKey"
                  value={row.key}
                  onChange={(event) => {
                    const next = event.target.value;
                    // Renaming a key has to move the mark with it, or ticking
                    // then renaming leaves an answer pointing at nothing.
                    setCorrect((keys) => keys.map((k) => (k === row.key ? next : k)));
                    setRow(index, { key: next });
                  }}
                  aria-label={`Option ${index + 1} key`}
                  className={`${inputClass} w-16 text-center`}
                />
                <input
                  name="optionText"
                  value={row.text}
                  onChange={(event) => setRow(index, { text: event.target.value })}
                  aria-label={`Option ${index + 1} text`}
                  className={inputClass}
                  placeholder="DENSE_RANK()"
                />
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  disabled={rows.length <= 2}
                  className="shrink-0 cursor-pointer px-2 text-body-sm text-ink-muted underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
            ))}

            <div>
              <Button type="button" variant="secondary" size="sm" onClick={addRow} disabled={rows.length >= 10}>
                Add an option
              </Button>
            </div>
          </fieldset>
        ) : null}

        {isTrueFalse ? (
          <Field
            htmlFor="trueFalse"
            label="The answer"
            required
            {...(error("correctAnswers") === undefined ? {} : { error: error("correctAnswers")! })}
          >
            <Select
              id="trueFalse"
              name="trueFalse"
              defaultValue={question?.correctAnswers?.[0]?.toUpperCase() ?? "TRUE"}
            >
              <option value="TRUE">True</option>
              <option value="FALSE">False</option>
            </Select>
          </Field>
        ) : null}

        <div className="grid gap-6 sm:grid-cols-3">
          <Field
            htmlFor="difficulty"
            label="Difficulty"
            {...(error("difficulty") === undefined ? {} : { error: error("difficulty")! })}
          >
            <Select id="difficulty" name="difficulty" defaultValue={question?.difficulty ?? "MEDIUM"}>
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </Select>
          </Field>

          <Field
            htmlFor="marks"
            label="Marks"
            {...(error("marks") === undefined ? {} : { error: error("marks")! })}
          >
            <input
              id="marks"
              name="marks"
              type="number"
              min={1}
              max={100}
              className={inputClass}
              defaultValue={question?.marks ?? 1}
            />
          </Field>

          <Field
            htmlFor="tags"
            label="Tags"
            hint="Comma separated."
            {...(error("tags") === undefined ? {} : { error: error("tags")! })}
          >
            <input
              id="tags"
              name="tags"
              className={inputClass}
              defaultValue={question?.tags.join(", ") ?? ""}
              placeholder="sql, windows"
            />
          </Field>
        </div>

        <Field
          htmlFor="explanation"
          label="Explanation"
          hint="Why the answer is the answer. Shown after an attempt, never before."
          {...(error("explanation") === undefined ? {} : { error: error("explanation")! })}
        >
          <textarea
            id="explanation"
            name="explanation"
            rows={3}
            className={areaClass}
            defaultValue={question?.explanation ?? ""}
          />
        </Field>

        <div className="flex justify-end border-t border-hairline pt-5">
          <Submit editing={editing} />
        </div>
      </form>
    </Card>
  );
}

/** A select that draws its own chevron — the native arrow cannot be positioned. */
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, children, ...rest } = props;
  return (
    <div className="relative">
      <select {...rest} className={`${inputClass} appearance-none ${className ?? ""}`}>
        {children}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink-muted"
      >
        ▾
      </span>
    </div>
  );
}

function Submit({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : editing ? "Save changes" : "Add to the bank"}
    </Button>
  );
}
