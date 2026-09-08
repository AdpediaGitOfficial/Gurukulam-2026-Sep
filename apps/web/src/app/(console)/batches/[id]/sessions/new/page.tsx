import type { Metadata } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { Card } from "@/components/ui/card";
import { SessionForm } from "@/features/batches/components/session-form";
import { getBatch } from "@/features/batches/server/batches-service";
import { getCourse } from "@/features/courses/server/courses-service";
import { listTrainers } from "@/features/trainers/server/trainers-service";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "Schedule a session" };

export default async function NewSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModule("batches", "edit");
  const { id } = await params;
  const batch = await getBatch(id);

  // The course's own topics, and the trainers who may teach it — a session
  // taught against a foreign topic, or by someone unapproved, is refused.
  const [course, trainers] = await Promise.all([
    getCourse(batch.courseId),
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
        title="Schedule a session"
        description="A session is the unit that actually happens on a day — assignments and the recording hang off it, not off the batch."
        breadcrumbs={[
          { label: "Batches", href: "/batches" },
          { label: batch.name, href: `/batches/${batch.batchId}` },
          { label: "Schedule a session" },
        ]}
      />
      <Card className="max-w-3xl">
        <SessionForm batch={batch} topics={course.topics} trainers={trainers.rows} />
      </Card>
    </PageBody>
  );
}
