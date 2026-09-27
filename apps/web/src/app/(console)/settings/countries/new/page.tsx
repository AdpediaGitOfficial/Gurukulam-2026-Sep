import type { Metadata } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { Card } from "@/components/ui/card";
import { CountryForm } from "@/features/localisation/components/country-form";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "Add a country" };

export default async function NewCountryPage() {
  await requireModule("settings", "edit");

  return (
    <PageBody>
      <PageHeader
        eyebrow="Settings"
        title="Add a country"
        description="Operating countries are the root of the location tree — a city belongs to one, and a college to a city."
        breadcrumbs={[
          { label: "Settings", href: "/settings" },
          { label: "Countries", href: "/settings/countries" },
          { label: "Add" },
        ]}
      />
      <Card className="max-w-3xl">
        <CountryForm />
      </Card>
    </PageBody>
  );
}
