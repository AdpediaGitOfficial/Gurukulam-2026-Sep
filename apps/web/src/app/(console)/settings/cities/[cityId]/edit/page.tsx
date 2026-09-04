import type { Metadata } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { Card } from "@/components/ui/card";
import { CityForm } from "@/features/localisation/components/city-form";
import { getCity, listCountries } from "@/features/localisation/server/localisation-service";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "Edit city" };

export default async function EditCityPage({
  params,
}: {
  params: Promise<{ cityId: string }>;
}) {
  await requireModule("settings", "edit");
  const { cityId } = await params;
  // Countries are still loaded: the picker is locked on edit, but the form is
  // one component and its create path needs them.
  const [city, countries] = await Promise.all([
    getCity(cityId),
    listCountries({ pageSize: "200", isActive: "true" }),
  ]);

  return (
    <PageBody>
      <PageHeader
        eyebrow="Settings"
        title={city.name}
        description="A city scopes a regional sub-admin's access, so archiving one narrows what those operators can see."
        breadcrumbs={[
          { label: "Settings", href: "/settings" },
          { label: "Cities", href: "/settings/cities" },
          { label: city.name },
        ]}
      />
      <Card className="max-w-3xl">
        <CityForm countries={countries.rows} city={city} />
      </Card>
    </PageBody>
  );
}
