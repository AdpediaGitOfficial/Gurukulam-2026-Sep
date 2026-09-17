import type { Metadata } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { Card } from "@/components/ui/card";
import { TrainerForm } from "@/features/trainers/components/trainer-form";
import { listCourses } from "@/features/courses/server/courses-service";
import { listCities } from "@/features/localisation/server/localisation-service";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "Add a trainer" };

export default async function NewTrainerPage() {
  await requireModule("trainers", "edit");
  const [cities, courses] = await Promise.all([
    listCities({ pageSize: "200", isActive: "true" }),
    listCourses({ pageSize: "200", isActive: "true" }),
  ]);

  return (
    <PageBody>
      <PageHeader
        eyebrow="Trainers"
        title="Add a trainer"
        description="Approved courses are what let a trainer be assigned to a batch."
        breadcrumbs={[{ label: "Trainers", href: "/trainers" }, { label: "Add" }]}
      />
      <Card className="max-w-4xl">
        <TrainerForm cities={cities.rows} courses={courses.rows} />
      </Card>
    </PageBody>
  );
}
