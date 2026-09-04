import type { Metadata } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { Card } from "@/components/ui/card";
import { BatchForm } from "@/features/batches/components/batch-form";
import { getBatch, listTrainerCandidates } from "@/features/batches/server/batches-service";
import { listCourses } from "@/features/courses/server/courses-service";
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

  /*
   * Candidates rather than a trainer list.
   *
   * The API answers who may be proposed for THIS batch and who would be
   * refused, using the same rule the proposal applies — so the picker offers
   * exactly what the endpoint would accept, and names the reason for everyone
   * it would not.
   */
  const [cities, courses, candidates] = await Promise.all([
    listCities({ pageSize: "200", isActive: "true" }),
    listCourses({ pageSize: "200", isActive: "true" }),
    listTrainerCandidates(batch.batchId),
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
          candidates={candidates}
          batch={batch}
        />
      </Card>
    </PageBody>
  );
}
