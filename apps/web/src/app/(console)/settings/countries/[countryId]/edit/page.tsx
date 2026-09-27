import type { Metadata } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { Card } from "@/components/ui/card";
import { CountryForm } from "@/features/localisation/components/country-form";
import { getCountry } from "@/features/localisation/server/localisation-service";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "Edit country" };

export default async function EditCountryPage({
  params,
}: {
  params: Promise<{ countryId: string }>;
}) {
  await requireModule("settings", "edit");
  const { countryId } = await params;
  const country = await getCountry(countryId);

  return (
    <PageBody>
      <PageHeader
        eyebrow="Settings"
        title={country.name}
        description="Correcting a country changes the defaults offered to everything created beneath it from here on. Records already saved keep what they were given."
        breadcrumbs={[
          { label: "Settings", href: "/settings" },
          { label: "Countries", href: "/settings/countries" },
          { label: country.name },
        ]}
      />
      <Card className="max-w-3xl">
        <CountryForm country={country} />
      </Card>
    </PageBody>
  );
}
