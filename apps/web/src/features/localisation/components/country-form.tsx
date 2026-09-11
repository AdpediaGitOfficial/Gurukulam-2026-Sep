"use client";

import Link from "next/link";
import type { Country } from "@gurukulam/contracts";

import {
  FormSection,
  FormShell,
  FormSwitch,
  FormText,
  FullWidth,
  LockedField,
} from "@/components/patterns/form-shell";
import { buttonVariants } from "@/components/ui/button";
import { saveCountry } from "@/features/localisation/server/actions";

/**
 * One form, two verbs.
 *
 * Adding and correcting a country are the same act with a different starting
 * point, so they share a component: two would drift the moment a field is
 * added to one of them.
 */
export function CountryForm({ country }: { country?: Country }) {
  const editing = country !== undefined;

  return (
    <FormShell
      action={saveCountry.bind(null, country?.countryId)}
      errorTitle={editing ? "Could not save that country" : "Could not add that country"}
      submitLabel={editing ? "Save changes" : "Add country"}
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
        <FormText
          name="name"
          label="Country name"
          required
          placeholder="India"
          defaultValue={country?.name}
        />
        {editing ? (
          <LockedField
            label="ISO-2 code"
            value={country.iso2}
            reason={`The country code ${country.countryCode} is derived from it and issued once.`}
          />
        ) : (
          <FormText
            name="iso2"
            label="ISO-2 code"
            required
            maxLength={2}
            placeholder="IN"
            hint="Fixed once saved — the country code is derived from it."
            className="font-mono uppercase"
          />
        )}
        <FormText
          name="iso3"
          label="ISO-3 code"
          required
          maxLength={3}
          placeholder="IND"
          defaultValue={country?.iso3}
          className="font-mono uppercase"
        />
        <FormText
          name="dialCode"
          label="Dial code"
          required
          placeholder="+91"
          hint="With the plus, as it is dialled."
          defaultValue={country?.dialCode}
          className="font-mono"
        />
        <FormText
          name="currency"
          label="Currency"
          required
          maxLength={3}
          placeholder="INR"
          hint="Three-letter code. Money is stored in minor units regardless."
          defaultValue={country?.currency}
          className="font-mono uppercase"
        />
        <FormText
          name="timezone"
          label="Default timezone"
          required
          placeholder="Asia/Kolkata"
          hint="An IANA name, e.g. Asia/Kolkata. Sessions are scheduled against it."
          defaultValue={country?.timezone}
          className="font-mono"
        />
        {editing ? (
          <FullWidth>
            <FormSwitch
              name="isActive"
              label="Active"
              hint="Archiving hides the country from pickers. Existing cities and records keep it."
              defaultChecked={country.isActive}
            />
          </FullWidth>
        ) : null}
      </FormSection>
    </FormShell>
  );
}
