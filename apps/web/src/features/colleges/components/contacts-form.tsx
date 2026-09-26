"use client";

import Link from "next/link";
import { useState } from "react";
import type { CollegeDetail } from "@gurukulam/contracts";

import { FormShell, useFieldError } from "@/components/patterns/form-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { TextField } from "@/components/ui/input";
import { saveContacts } from "@/features/colleges/server/actions";
import { cn } from "@/lib/cn";

interface ContactRow {
  /** Stable for the life of this form. The radio group votes with it. */
  key: string;
  /** Absent on a row the operator just added — that is what makes it new. */
  pocId: string;
  name: string;
  designation: string;
  department: string;
  email: string;
  phone: string;
}

const BLANK = { pocId: "", name: "", designation: "", department: "", email: "", phone: "" };

/**
 * The whole contact list, edited as one list and saved in one call.
 *
 * A college is an actor we deal with through people, so the contacts are not a
 * sub-page of the college — they are how the college is reachable at all.
 *
 * Each row carries its `pocId` in a hidden field. That is what lets the API
 * tell an edit from an addition: `college_users.poc_id` points at a contact,
 * so a person whose phone was corrected has to keep the id they already had.
 */
export function ContactsForm({ college }: { college: CollegeDetail }) {
  const initial: ContactRow[] =
    college.pocs.length === 0
      ? [{ ...BLANK, key: "new-0" }]
      : college.pocs.map((poc) => ({
          key: poc.pocId,
          pocId: poc.pocId,
          name: poc.name,
          designation: poc.designation ?? "",
          department: poc.department ?? "",
          email: poc.email,
          phone: poc.phone ?? "",
        }));

  const [rows, setRows] = useState<ContactRow[]>(initial);
  const [nextKey, setNextKey] = useState(1);
  /**
   * Which contact is primary, as a radio group rather than a checkbox each.
   *
   * Exactly one contact is primary; a group of checkboxes lets an operator
   * tick two and only learn it was wrong after saving. A radio cannot express
   * the invalid state at all.
   */
  const [primary, setPrimary] = useState(
    college.pocs.find((poc) => poc.isPrimary)?.pocId ?? initial[0]?.key ?? "",
  );

  const set = (key: string, field: keyof ContactRow, value: string) =>
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, [field]: value } : row)),
    );

  const remove = (key: string) => {
    setRows((current) => {
      const next = current.filter((row) => row.key !== key);
      // The primary must still exist, or the college silently loses one.
      if (key === primary) setPrimary(next[0]?.key ?? "");
      return next;
    });
  };

  return (
    <FormShell
      action={saveContacts.bind(null, college.collegeId)}
      errorTitle="Could not save those contacts"
      submitLabel="Save contacts"
      secondary={
        <Link
          href={`/colleges/${college.collegeId}`}
          className={buttonVariants({ variant: "secondary" })}
        >
          Cancel
        </Link>
      }
    >
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-h3 text-ink">Points of contact</h2>
            <p className="mt-1 max-w-2xl text-body-sm text-ink-muted">
              A college is an actor we deal with through people. The primary contact is who
              requirements and certificate approvals go to — removing someone here keeps their
              history, it only takes them off the list.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              const key = `new-${nextKey}`;
              setRows((current) => [...current, { ...BLANK, key }]);
              setNextKey((n) => n + 1);
              if (rows.length === 0) setPrimary(key);
            }}
          >
            Add contact
          </Button>
        </div>

        <ListError />

        {rows.length === 0 ? (
          <p className="rounded-tile border border-dashed border-hairline-strong px-4 py-8 text-center text-body-sm text-ink-subtle">
            No contacts. Saving an empty list leaves nobody to raise a requirement or approve a
            certificate name.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {rows.map((row, index) => (
              <li
                key={row.key}
                className="flex flex-col gap-4 rounded-tile border border-hairline p-4"
              >
                <input type="hidden" name="pocKey" value={row.key} />
                <input type="hidden" name="pocId" value={row.pocId} />

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-caption font-bold tracking-wide text-ink-subtle uppercase">
                    Contact {index + 1}
                  </span>
                  <div className="flex items-center gap-4">
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-2 text-body-sm",
                        primary === row.key ? "text-ink" : "text-ink-muted",
                      )}
                    >
                      <input
                        type="radio"
                        name="primaryKey"
                        value={row.key}
                        checked={primary === row.key}
                        onChange={() => setPrimary(row.key)}
                        className="size-4 cursor-pointer accent-brand"
                      />
                      Primary contact
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(row.key)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <RowField
                    row={row}
                    index={index}
                    field="name"
                    label="Full name"
                    placeholder="Dr. S. Ramakrishnan"
                    required
                    onChange={set}
                  />
                  <RowField
                    row={row}
                    index={index}
                    field="email"
                    label="Email address"
                    type="email"
                    placeholder="tpo@example.edu"
                    required
                    onChange={set}
                  />
                  <RowField
                    row={row}
                    index={index}
                    field="designation"
                    label="Designation"
                    placeholder="Head, Training & Placement"
                    onChange={set}
                  />
                  <RowField
                    row={row}
                    index={index}
                    field="department"
                    label="Department"
                    placeholder="Computer Science"
                    onChange={set}
                  />
                  <RowField
                    row={row}
                    index={index}
                    field="phone"
                    label="Phone"
                    placeholder="+91 98450 00111"
                    onChange={set}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </FormShell>
  );
}

/**
 * One field of one contact.
 *
 * Errors arrive keyed by position — `pocs.1.email` — because that is the shape
 * the API validates, and a row the operator can see is the only thing a
 * message about it can usefully point at.
 */
function RowField({
  row,
  index,
  field,
  label,
  placeholder,
  type,
  required,
  onChange,
}: {
  row: ContactRow;
  index: number;
  field: "name" | "designation" | "department" | "email" | "phone";
  label: string;
  placeholder?: string;
  type?: "email";
  required?: boolean;
  onChange: (key: string, field: keyof ContactRow, value: string) => void;
}) {
  const error = useFieldError(`pocs.${index}.${field}`);
  return (
    <TextField
      id={`poc-${row.key}-${field}`}
      name={`poc${field[0]?.toUpperCase()}${field.slice(1)}`}
      label={label}
      value={row[field]}
      onChange={(event) => onChange(row.key, field, event.target.value)}
      {...(placeholder === undefined ? {} : { placeholder })}
      {...(type === undefined ? {} : { type })}
      {...(required === true ? { required: true } : {})}
      {...(error === undefined ? {} : { error })}
    />
  );
}

/** A refusal about the list as a whole rather than about one field. */
function ListError() {
  const error = useFieldError("pocs");
  if (error === undefined) return null;
  return <p className="text-body-sm text-danger">{error}</p>;
}
