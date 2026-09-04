"use client";

import Link from "next/link";
import type { Country } from "@gurukulam/contracts";

import { FormSection, FormShell, FormSelect, FormText } from "@/components/patterns/form-shell";
import { buttonVariants } from "@/components/ui/button";
import { createCity } from "@/features/localisation/server/actions";

export function CityForm({ countries }: { countries: readonly Country[] }) {
  return (
    <FormShell
      action={createCity}
      errorTitle="Could not add that city"
      submitLabel="Add city"
      secondary={
        <Link href="/settings/cities" className={buttonVariants({ variant: "secondary" })}>
          Cancel
        </Link>
      }
    >
      <FormSection
        title="The city"
        description="A city is not just a label — it is what scopes a regional sub-admin's access, so adding one widens what the permission model can express."
      >
        <FormSelect
          name="countryId"
          label="Country"
          required
          placeholder="Select a country"
          options={countries.map((country) => ({
            value: country.countryId,
            label: `${country.name} (${country.iso2})`,
          }))}
        />
        <FormText name="name" label="City name" required placeholder="Kochi" />
        <FormText name="state" label="State or province" placeholder="Kerala" />
        <FormText
          name="timezone"
          label="Timezone"
          placeholder="Asia/Kolkata"
          hint="Leave blank to inherit the country's."
          className="font-mono"
        />
      </FormSection>
    </FormShell>
  );
}
