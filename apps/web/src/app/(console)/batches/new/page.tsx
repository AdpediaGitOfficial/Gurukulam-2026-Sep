import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { BatchForm } from "@/features/batches/components/batch-form";
import { listCourses } from "@/features/courses/server/courses-service";
import { listTrainers } from "@/features/trainers/server/trainers-service";
import { listCities } from "@/features/localisation/server/localisation-service";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "Create a batch" };

export default async function NewBatchPage() {
  await requireModule("batches", "edit");
  const [cities, courses, trainers] = await Promise.all([
    listCities({ pageSize: "200", isActive: "true" }),
    listCourses({ pageSize: "200", isActive: "true" }),
    listTrainers({ pageSize: "200", accountStatus: "ACTIVE" }),
  ]);

  return (
    <PageBody>
      <PageHeader
        eyebrow="Batches"
        title="Create a batch"
        description="A batch runs one course for one cohort. This one is retail — a college batch comes from confirming a requirement."
        breadcrumbs={[{ label: "Batches", href: "/batches" }, { label: "Create" }]}
      />
      <Card className="max-w-4xl">
        {courses.rows.length === 0 ? (
          <EmptyState
            title="Add a course first"
            description="A batch runs a course, and there are none yet."
            action={
              <Link href="/courses/new" className={buttonVariants({ variant: "primary" })}>
                Add a course
              </Link>
            }
          />
        ) : (
          <BatchForm cities={cities.rows} courses={courses.rows} trainers={trainers.rows} />
        )}
      </Card>
    </PageBody>
  );
}
