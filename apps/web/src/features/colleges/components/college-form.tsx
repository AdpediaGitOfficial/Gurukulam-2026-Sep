"use client";

import Link from "next/link";
import { useState } from "react";
import type { City, CollegeDetail } from "@gurukulam/contracts";

import {
  FormSection,
  FormSelect,
  FormShell,
  FormSwitch,
  FormText,
  FormTextarea,
  FullWidth,
} from "@/components/patterns/form-shell";
import { buttonVariants } from "@/components/ui/button";
import { saveCollege } from "@/features/colleges/server/actions";

export function CollegeForm({
  cities,
  college,
}: {
  cities: readonly City[];
  college?: CollegeDetail;
}) {
  const editing = college !== undefined;

  /**
   * Country is derived from the city rather than asked for twice.
   *
   * A city already belongs to a country, so two selects could disagree — and
   * the contract wants both. Picking the city settles it.
   */
  const [cityId, setCityId] = useState(college?.cityId ?? cities[0]?.cityId ?? "");
  const country = cities.find((city) => city.cityId === cityId)?.countryId ?? "";

  return (
    <FormShell
      action={saveCollege.bind(null, college?.collegeId)}
      errorTitle={editing ? "Could not save that college" : "Could not add that college"}
      submitLabel={editing ? "Save changes" : "Add college"}
      secondary={
        <Link
          href={editing ? `/colleges/${college.collegeId}` : "/colleges"}
          className={buttonVariants({ variant: "secondary" })}
        >
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
          defaultValue={college?.name}
        />
        <FormText
          name="shortName"
          label="Short name"
          placeholder="SNC"
          hint="Used where space is tight."
          defaultValue={college?.shortName ?? ""}
        />
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
        <FormText
          name="affiliation"
          label="Affiliation"
          placeholder="Autonomous · VTU"
          defaultValue={college?.affiliation ?? ""}
        />
        <FormText
          name="website"
          label="Website"
          type="url"
          placeholder="https://example.edu"
          defaultValue={college?.website ?? ""}
        />
        <FormText
          name="postalCode"
          label="Postal code"
          placeholder="682021"
          defaultValue={college?.postalCode ?? ""}
        />
        <FullWidth>
          <FormText
            name="addressLine1"
            label="Address"
            placeholder="Street address"
            defaultValue={college?.addressLine1 ?? ""}
          />
        </FullWidth>
        <FullWidth>
          <FormText
            name="addressLine2"
            label="Address, second line"
            placeholder="Area, landmark"
            defaultValue={college?.addressLine2 ?? ""}
          />
        </FullWidth>
        <FullWidth>
          <FormText
            name="disciplines"
            label="Disciplines"
            placeholder="B.Tech CSE, B.Tech ECE, MCA"
            hint="Comma separated. These become the filters on the college's student roster."
            defaultValue={college?.disciplines.join(", ")}
          />
        </FullWidth>
        {editing ? (
          <FullWidth>
            <FormSwitch
              name="isActive"
              label="Active"
              hint="Archiving keeps every record but takes the college out of the pickers."
              defaultChecked={college.isActive}
            />
          </FullWidth>
        ) : null}
      </FormSection>

      {editing ? null : (
        <FormSection
          title="First point of contact"
          description="A college with no contact is a directory row, not an actor — there is nobody to raise a requirement or approve certificate names. This one becomes the primary contact."
        >
          <FormText name="pocName" label="Full name" placeholder="Dr. S. Ramakrishnan" />
          <FormText name="pocDesignation" label="Designation" placeholder="Head, Training & Placement" />
          <FormText name="pocEmail" label="Email address" type="email" placeholder="tpo@example.edu" />
          <FormText name="pocPhone" label="Phone" placeholder="+91 98450 00111" />
        </FormSection>
      )}

      <FormSection title="Notes">
        <FullWidth>
          <FormTextarea
            name="notes"
            label="Anything worth recording"
            rows={3}
            defaultValue={college?.notes ?? ""}
          />
        </FullWidth>
      </FormSection>
    </FormShell>
  );
}
