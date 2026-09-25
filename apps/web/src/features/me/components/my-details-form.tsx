"use client";

import { useState } from "react";
import type { MeProfile } from "@gurukulam/contracts";

import { FormSection, FormShell, FormText, FullWidth } from "@/components/patterns/form-shell";
import { Button } from "@/components/ui/button";
import { updateMyDetails } from "@/features/me/server/actions";

/**
 * How we reach you.
 *
 * ── Why it opens closed ─────────────────────────────────────────────────
 *
 * An account screen is read far more often than it is edited — a student
 * opens it to check which address their receipt went to, not to retype their
 * postcode. Five inputs permanently open above that answer is five inputs of
 * noise around it.
 */
export function MyDetailsForm({ me }: { me: MeProfile }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      // Wrapped, because the card is a flex column and a bare button stretches
      // to its full width — which reads as a primary action rather than the
      // quiet one it is.
      <div className="flex">
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Update my details
        </Button>
      </div>
    );
  }

  return (
    <FormShell
      action={updateMyDetails}
      errorTitle="Could not save that"
      submitLabel="Save"
      pendingLabel="Saving…"
      secondary={
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      }
    >
      <FormSection
        title="How we reach you"
        description="Clear a field to remove it. Your name, email and student code are set by the office."
      >
        <FormText name="phone" label="Phone" type="tel" defaultValue={me.phone ?? ""} />
        <FormText
          name="altPhone"
          label="Alternate phone"
          type="tel"
          defaultValue={me.altPhone ?? ""}
          hint="Someone who can reach you if your own number is off."
        />
        <FullWidth>
          <FormText name="addressLine1" label="Address" defaultValue={me.addressLine1 ?? ""} />
        </FullWidth>
        <FullWidth>
          <FormText
            name="addressLine2"
            label="Address, second line"
            defaultValue={me.addressLine2 ?? ""}
          />
        </FullWidth>
        <FormText name="postalCode" label="Postcode" defaultValue={me.postalCode ?? ""} />
      </FormSection>
    </FormShell>
  );
}
