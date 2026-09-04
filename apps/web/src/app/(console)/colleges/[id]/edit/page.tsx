import type { Metadata } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { Card } from "@/components/ui/card";
import { CollegeForm } from "@/features/colleges/components/college-form";
import { getCollege } from "@/features/colleges/server/colleges-service";
import { listCities } from "@/features/localisation/server/localisation-service";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "Edit college" };

export default async function EditCollegePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModule("colleges", "edit");
  const { id } = await params;
  const [college, cities] = await Promise.all([
    getCollege(id),
    listCities({ pageSize: "200", isActive: "true" }),
  ]);

  return (
    <PageBody>
      <PageHeader
        eyebrow={college.collegeCode}
        title={college.name}
        description="Contacts are edited from the college's own page — this screen is the institution's own details."
        breadcrumbs={[
          { label: "Colleges", href: "/colleges" },
          { label: college.name, href: `/colleges/${college.collegeId}` },
          { label: "Edit" },
        ]}
      />
      <Card className="max-w-3xl">
        <CollegeForm cities={cities.rows} college={college} />
      </Card>
    </PageBody>
  );
}
