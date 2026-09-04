"use client";

import Link from "next/link";
import { useState } from "react";
import type { City } from "@gurukulam/contracts";

import {
  FormSection,
  FormSelect,
  FormShell,
  FormText,
  FormTextarea,
  FullWidth,
} from "@/components/patterns/form-shell";
import { buttonVariants } from "@/components/ui/button";
import { createCollege } from "@/features/colleges/server/actions";

export function CollegeForm({ cities }: { cities: readonly City[] }) {
  /**
   * Country is derived from the city rather than asked for twice.
   *
   * A city already belongs to a country, so two selects could disagree — and
   * the contract wants both. Picking the city settles it.
   */
  const [cityId, setCityId] = useState(cities[0]?.cityId ?? "");
  const country = cities.find((city) => city.cityId === cityId)?.countryId ?? "";

  return (
    <FormShell
      action={createCollege}
      errorTitle="Could not add that college"
      submitLabel="Add college"
      secondary={
        <Link href="/colleges" className={buttonVariants({ variant: "secondary" })}>
          Cancel
        </Link>
      }
    >
      <input type="hidden" name="countryId" value={country} />

      <FormSection title="The institution">
        <FormText
          name="name"
          label="College name"
          required
          placeholder="Sri Narayana College of Engineering"
        />
        <FormText name="shortName" label="Short name" placeholder="SNC" hint="Used where space is tight." />
        <FormSelect
          name="cityId"
          label="City"
          required
          value={cityId}
          onChange={(event) => setCityId(event.target.value)}
          options={cities.map((city) => ({
            value: city.cityId,
            label: city.state === null ? city.name : `${city.name}, ${city.state}`,
          }))}
        />
        <FormText name="affiliation" label="Affiliation" placeholder="Autonomous · VTU" />
        <FormText name="website" label="Website" type="url" placeholder="https://example.edu" />
        <FormText name="postalCode" label="Postal code" placeholder="682021" />
        <FullWidth>
          <FormText name="addressLine1" label="Address" placeholder="Street address" />
        </FullWidth>
        <FullWidth>
          <FormText
            name="disciplines"
            label="Disciplines"
            placeholder="B.Tech CSE, B.Tech ECE, MCA"
            hint="Comma separated. These become the filters on the college's student roster."
          />
        </FullWidth>
      </FormSection>

      <FormSection
        title="First point of contact"
        description="A college with no contact is a directory row, not an actor — there is nobody to raise a requirement or approve certificate names. This one becomes the primary contact."
      >
        <FormText name="pocName" label="Full name" placeholder="Dr. S. Ramakrishnan" />
        <FormText name="pocDesignation" label="Designation" placeholder="Head, Training & Placement" />
        <FormText name="pocEmail" label="Email address" type="email" placeholder="tpo@example.edu" />
        <FormText name="pocPhone" label="Phone" placeholder="+91 98450 00111" />
      </FormSection>

      <FormSection title="Notes">
        <FullWidth>
          <FormTextarea name="notes" label="Anything worth recording" rows={3} />
        </FullWidth>
      </FormSection>
    </FormShell>
  );
}
