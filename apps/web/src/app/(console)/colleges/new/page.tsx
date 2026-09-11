import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CollegeForm } from "@/features/colleges/components/college-form";
import { listCities } from "@/features/localisation/server/localisation-service";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "Add a college" };

export default async function NewCollegePage() {
  await requireModule("colleges", "edit");
  const cities = await listCities({ pageSize: "200", isActive: "true" });

  return (
    <PageBody>
      <PageHeader
        eyebrow="Colleges"
        title="Add a college"
        description="The institutional CRM. A college carries its own contacts, requirements, students and contract."
        breadcrumbs={[{ label: "Colleges", href: "/colleges" }, { label: "Add" }]}
      />
      <Card className="max-w-4xl">
        {cities.rows.length === 0 ? (
          <EmptyState
            title="Add a city first"
            description="A college belongs to a city, and there are none yet."
            action={
              <Link href="/settings/cities/new" className={buttonVariants({ variant: "primary" })}>
                Add a city
              </Link>
            }
          />
        ) : (
          <CollegeForm cities={cities.rows} />
        )}
      </Card>
    </PageBody>
  );
}
