"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { updateAccountPhoto } from "@/features/settings/server/actions";
import { IDLE, type FormState } from "@/lib/form";

/**
 * The photo, which is the one field on your own account you may set.
 *
 * A URL rather than a file picker, because the API stores a URL and there is
 * no upload endpoint — a picker here would be a control that looks like it
 * uploads and does not. Clearing the box removes the photo.
 */
export function AccountPhotoForm({ photoUrl }: { photoUrl: string | null }) {
  const [state, submit] = useActionState<FormState, FormData>(updateAccountPhoto, IDLE);

  return (
    <form action={submit} className="flex flex-col gap-4">
      {state.message === undefined ? null : (
        <Alert intent="danger" title="That photo could not be saved">
          {state.message}
        </Alert>
      )}

      <Field
        htmlFor="photoUrl"
        label="Photo URL"
        hint="Leave it empty to remove the photo."
        {...(state.fields?.["photoUrl"] === undefined ? {} : { error: state.fields["photoUrl"] })}
      >
        <input
          id="photoUrl"
          name="photoUrl"
          type="url"
          defaultValue={photoUrl ?? ""}
          placeholder="https://…"
          className="h-12 w-full rounded-tile border border-hairline-strong bg-surface px-4 text-body text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none"
        />
      </Field>

      <div className="flex justify-end">
        <Submit />
      </div>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save photo"}
    </Button>
  );
}
