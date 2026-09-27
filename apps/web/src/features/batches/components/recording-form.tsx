"use client";

import { FormSection, FormSelect, FormShell, FormText, FullWidth } from "@/components/patterns/form-shell";
import { Checkbox } from "@/components/ui/checkbox";
import { linkRecording } from "@/features/batches/server/actions";

/**
 * Attaching the recording of a delivered session.
 *
 * Offered only once the session is complete: a recording is the artefact of a
 * session that happened, and a link on a session still to be taught is either
 * a mistake or a promise the system cannot keep.
 */
export function RecordingForm({ sessionId }: { sessionId: string }) {
  return (
    <FormShell
      action={linkRecording.bind(null, sessionId)}
      errorTitle="Could not attach that recording"
      submitLabel="Attach recording"
      pendingLabel="Attaching…"
    >
      <FormSection
        title="Recording"
        description="Students who missed the session catch up from here. The link is stored as given — nothing re-hosts or re-encodes it."
      >
        <FullWidth>
          <FormText
            name="url"
            label="Link"
            type="url"
            required
            placeholder="https://www.youtube.com/watch?v=…"
          />
        </FullWidth>
        <FormText
          name="title"
          label="Title"
          placeholder="Window functions — full session"
          hint="Optional. Shown to students in place of the raw URL."
        />
        <FormSelect
          name="provider"
          label="Where it lives"
          defaultValue="YOUTUBE"
          hint="Stored rather than guessed from the URL later."
          options={[
            { value: "YOUTUBE", label: "YouTube" },
            { value: "S3", label: "S3 / CloudFront" },
            { value: "ZOOM", label: "Zoom" },
            { value: "OTHER", label: "Somewhere else" },
          ]}
        />
        <FullWidth>
          <Checkbox
            id="isPublished"
            name="isPublished"
            label="Visible to students now"
            hint="Leave unticked to attach it but hold it back."
            defaultChecked
          />
        </FullWidth>
      </FormSection>
    </FormShell>
  );
}
