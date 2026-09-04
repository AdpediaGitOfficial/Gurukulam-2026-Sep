"use client";

import Link from "next/link";

import {
  FormSection,
  FormShell,
  FormText,
} from "@/components/patterns/form-shell";
import { buttonVariants } from "@/components/ui/button";
import { createCountry } from "@/features/localisation/server/actions";

export function CountryForm() {
  return (
    <FormShell
      action={createCountry}
      errorTitle="Could not add that country"
      submitLabel="Add country"
      secondary={
        <Link href="/settings/countries" className={buttonVariants({ variant: "secondary" })}>
          Cancel
        </Link>
      }
    >
      <FormSection
        title="The country"
        description="Set up once. Its dial code, currency and timezone become the defaults for everything beneath it."
      >
        <FormText name="name" label="Country name" required placeholder="India" />
        <FormText
          name="iso2"
          label="ISO-2 code"
          required
          maxLength={2}
          placeholder="IN"
          className="font-mono uppercase"
        />
        <FormText
          name="iso3"
          label="ISO-3 code"
          required
          maxLength={3}
          placeholder="IND"
          className="font-mono uppercase"
        />
        <FormText
          name="dialCode"
          label="Dial code"
          required
          placeholder="+91"
          hint="With the plus, as it is dialled."
          className="font-mono"
        />
        <FormText
          name="currency"
          label="Currency"
          required
          maxLength={3}
          placeholder="INR"
          hint="Three-letter code. Money is stored in minor units regardless."
          className="font-mono uppercase"
        />
        <FormText
          name="timezone"
          label="Default timezone"
          required
          placeholder="Asia/Kolkata"
          hint="An IANA name, e.g. Asia/Kolkata. Sessions are scheduled against it."
          className="font-mono"
        />
      </FormSection>
    </FormShell>
  );
}
