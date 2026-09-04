import type { Metadata } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { Card } from "@/components/ui/card";
import { TrainerForm } from "@/features/trainers/components/trainer-form";
import { getTrainer } from "@/features/trainers/server/trainers-service";
import { listCourses } from "@/features/courses/server/courses-service";
import { listCities } from "@/features/localisation/server/localisation-service";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "Edit trainer" };

export default async function EditTrainerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModule("trainers", "edit");
  const { id } = await params;
  const [trainer, cities, courses] = await Promise.all([
    getTrainer(id),
    listCities({ pageSize: "200", isActive: "true" }),
    listCourses({ pageSize: "200", isActive: "true" }),
  ]);

  return (
    <PageBody>
      <PageHeader
        eyebrow={trainer.trainerCode}
        title={trainer.name}
        description="Removing a course approval does not touch batches already assigned — it stops this trainer being picked for new ones."
        breadcrumbs={[{ label: "Trainers", href: "/trainers" }, { label: trainer.name }]}
      />
      <Card className="max-w-4xl">
        <TrainerForm cities={cities.rows} courses={courses.rows} trainer={trainer} />
      </Card>
    </PageBody>
  );
}
