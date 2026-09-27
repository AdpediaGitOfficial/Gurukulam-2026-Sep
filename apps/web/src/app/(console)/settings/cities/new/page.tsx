import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CityForm } from "@/features/localisation/components/city-form";
import { listCountries } from "@/features/localisation/server/localisation-service";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "Add a city" };

export default async function NewCityPage() {
  await requireModule("settings", "edit");
  const countries = await listCountries({ pageSize: "200", isActive: "true" });

  return (
    <PageBody>
      <PageHeader
        eyebrow="Settings"
        title="Add a city"
        description="Cities scope regional sub-admins, and every college and student belongs to one."
        breadcrumbs={[
          { label: "Settings", href: "/settings" },
          { label: "Cities", href: "/settings/cities" },
          { label: "Add" },
        ]}
      />
      <Card className="max-w-3xl">
        {/* A city needs a country. On a fresh deployment that is the first
            thing to set up, so say so rather than offering an empty select. */}
        {countries.rows.length === 0 ? (
          <EmptyState
            title="Add a country first"
            description="A city belongs to a country, and there are none yet."
            action={
              <Link
                href="/settings/countries/new"
                className={buttonVariants({ variant: "primary" })}
              >
                Add a country
              </Link>
            }
          />
        ) : (
          <CityForm countries={countries.rows} />
        )}
      </Card>
    </PageBody>
  );
}
