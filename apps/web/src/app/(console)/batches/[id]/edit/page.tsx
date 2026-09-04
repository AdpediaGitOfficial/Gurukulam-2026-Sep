import type { Metadata } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { Card } from "@/components/ui/card";
import { BatchForm } from "@/features/batches/components/batch-form";
import { getBatch } from "@/features/batches/server/batches-service";
import { listCourses } from "@/features/courses/server/courses-service";
import { listTrainers } from "@/features/trainers/server/trainers-service";
import { listCities } from "@/features/localisation/server/localisation-service";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "Edit batch" };

export default async function EditBatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModule("batches", "edit");
  const { id } = await params;
  const batch = await getBatch(id);

  // Only trainers approved for this batch's course are offered: a batch may
  // only be given to someone approved for it, and offering the rest would
  // produce a refusal after the operator had already chosen.
  const [cities, courses, trainers] = await Promise.all([
    listCities({ pageSize: "200", isActive: "true" }),
    listCourses({ pageSize: "200", isActive: "true" }),
    listTrainers({
      pageSize: "200",
      accountStatus: "ACTIVE",
      approvedForCourseId: batch.courseId,
    }),
  ]);

  return (
    <PageBody>
      <PageHeader
        eyebrow={batch.batchCode}
        title={batch.name}
        description="Course and segment are fixed. Everything else — dates, venue, seat cap, status — can be corrected here."
        breadcrumbs={[{ label: "Batches", href: "/batches" }, { label: batch.name }]}
      />
      <Card className="max-w-4xl">
        <BatchForm
          cities={cities.rows}
          courses={courses.rows}
          trainers={trainers.rows}
          batch={batch}
        />
      </Card>
    </PageBody>
  );
}
