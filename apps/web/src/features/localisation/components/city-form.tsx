"use client";

import Link from "next/link";
import type { City, Country } from "@gurukulam/contracts";

import {
  FormSection,
  FormSelect,
  FormShell,
  FormSwitch,
  FormText,
  FullWidth,
  LockedField,
} from "@/components/patterns/form-shell";
import { buttonVariants } from "@/components/ui/button";
import { saveCity } from "@/features/localisation/server/actions";

export function CityForm({
  countries,
  city,
}: {
  countries: readonly Country[];
  city?: City;
}) {
  const editing = city !== undefined;

  return (
    <FormShell
      action={saveCity.bind(null, city?.cityId)}
      errorTitle={editing ? "Could not save that city" : "Could not add that city"}
      submitLabel={editing ? "Save changes" : "Add city"}
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
        {editing ? (
          <LockedField
            label="Country"
            value={city.countryName ?? "—"}
            reason="Moving a city between countries would silently re-scope every operator, college and student under it."
          />
        ) : (
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
        )}
        <FormText
          name="name"
          label="City name"
          required
          placeholder="Kochi"
          defaultValue={city?.name}
        />
        <FormText
          name="state"
          label="State or province"
          placeholder="Kerala"
          defaultValue={city?.state ?? ""}
        />
        <FormText
          name="timezone"
          label="Timezone"
          placeholder="Asia/Kolkata"
          hint="Leave blank to inherit the country's."
          defaultValue={city?.timezone ?? ""}
          className="font-mono"
        />
        {editing ? (
          <FullWidth>
            <FormSwitch
              name="isActive"
              label="Active"
              hint="Archiving hides the city from pickers. Operators scoped to it keep their scope."
              defaultChecked={city.isActive}
            />
          </FullWidth>
        ) : null}
      </FormSection>
    </FormShell>
  );
}
