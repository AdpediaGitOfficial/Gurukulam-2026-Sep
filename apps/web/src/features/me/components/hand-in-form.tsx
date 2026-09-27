"use client";

import { useMemo, useState } from "react";

import { FormSection, FormShell, FormText, FormTextarea, FullWidth } from "@/components/patterns/form-shell";
import { Button } from "@/components/ui/button";
import { submitAssignment } from "@/features/me/server/actions";

/**
 * Handing one piece of work in.
 *
 * ── Why it opens closed ─────────────────────────────────────────────────
 *
 * A student with three pieces of work outstanding would otherwise meet six
 * inputs stacked down a phone screen, and have to scroll past two of them to
 * read the third assignment's title. The button is the one thing the card is
 * for; the fields arrive when they are wanted.
 *
 * ── Why there is no file input ──────────────────────────────────────────
 *
 * There is no object storage. A file picker with nowhere to put the file is a
 * promise the product cannot keep — the student would tap Hand it in, see a
 * success, and have submitted nothing. A link to a drive they already use is
 * both honest and what the column models.
 */
export function HandInForm({
  assignmentId,
  submitted,
  defaults,
}: {
  assignmentId: string;
  /** Changes every label: replacing work reads differently from doing it. */
  submitted: boolean;
  defaults: { fileUrl: string | null; contentText: string | null };
}) {
  const [open, setOpen] = useState(false);
  // Bound here rather than posted as a hidden field — see the action.
  const action = useMemo(() => submitAssignment.bind(null, assignmentId), [assignmentId]);

  if (!open) {
    return (
      // Wrapped: the card is a flex column, and a bare button stretches to its
      // full width, which reads as a page-level action rather than this card's.
      <div className="flex">
        <Button
          type="button"
          variant={submitted ? "secondary" : "primary"}
          size="sm"
          onClick={() => setOpen(true)}
        >
          {submitted ? "Replace what I handed in" : "Hand it in"}
        </Button>
      </div>
    );
  }

  return (
    <FormShell
      action={action}
      errorTitle="Could not hand that in"
      submitLabel={submitted ? "Replace it" : "Hand it in"}
      pendingLabel="Sending…"
      secondary={
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      }
    >
      <FormSection
        title={submitted ? "Replace your work" : "Your work"}
        description={
          submitted
            ? "This replaces what you handed in before. Your trainer sees only the latest version."
            : "Link to your work, or type your answer here. One of the two is enough."
        }
      >
        <FullWidth>
          <FormText
            name="fileUrl"
            label="Link to your work"
            type="url"
            placeholder="https://"
            defaultValue={defaults.fileUrl ?? ""}
            hint="A Drive, GitHub or Docs link. Make sure your trainer can open it."
          />
        </FullWidth>
        <FullWidth>
          <FormTextarea
            name="contentText"
            label="Or write your answer"
            rows={6}
            defaultValue={defaults.contentText ?? ""}
          />
        </FullWidth>
      </FormSection>
    </FormShell>
  );
}
