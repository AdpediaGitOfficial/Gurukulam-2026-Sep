import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SessionEditForm } from "@/features/batches/components/session-edit-form";
import { getBatch, getSession } from "@/features/batches/server/batches-service";
import { getCourse } from "@/features/courses/server/courses-service";
import { listTrainers } from "@/features/trainers/server/trainers-service";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "Edit session" };

/**
 * Editing a scheduled session.
 *
 * A delivered session is delivery history: the API refuses to edit one and
 * says to reopen it first. Rather than render a form the save will bounce,
 * this shows the refusal and the way out — losing somebody's typing to a 409
 * is a worse way to learn the same rule.
 */
export default async function EditSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  await requireModule("batches", "edit");
  const { sessionId } = await params;
  const session = await getSession(sessionId);

  if (session.status === "COMPLETED" || session.status === "CANCELLED") {
    const delivered = session.status === "COMPLETED";
    return (
      <PageBody>
        <PageHeader
          eyebrow={session.sessionCode}
          title="Edit session"
          breadcrumbs={[
            { label: "Batches", href: "/batches" },
            { label: session.title, href: `/batches/sessions/${sessionId}` },
            { label: "Edit" },
          ]}
        />
        <Alert
          intent="warning"
          title={delivered ? "This session is delivered" : "This session was cancelled"}
          action={
            <Link
              href={`/batches/sessions/${sessionId}`}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Back to the session
            </Link>
          }
        >
          {delivered
            ? "Delivery history is not edited. Reopen it first — which is refused if assignments are already published against it. Its recording can still be attached or replaced."
            : "A cancelled session keeps its record so the schedule still explains itself."}
        </Alert>
      </PageBody>
    );
  }

  const batch = await getBatch(session.batchId);
  // The course's own topics, and the trainers approved to teach it — the API
  // refuses a foreign topic or an unapproved trainer, so offering either here
  // would be offering a mistake.
  const [course, trainers] = await Promise.all([
    getCourse(batch.courseId),
    listTrainers({ pageSize: "200", accountStatus: "ACTIVE", approvedForCourseId: batch.courseId }),
  ]);

  return (
    <PageBody>
      <PageHeader
        eyebrow={session.sessionCode}
        title="Edit session"
        description="What the session is, and who teaches it. Moving it is a reschedule, which tells the roster why."
        breadcrumbs={[
          { label: "Batches", href: "/batches" },
          { label: batch.name, href: `/batches/${batch.batchId}` },
          { label: session.title, href: `/batches/sessions/${sessionId}` },
          { label: "Edit" },
        ]}
      />
      <Card className="max-w-3xl">
        <SessionEditForm session={session} topics={course.topics} trainers={trainers.rows} />
      </Card>
    </PageBody>
  );
}
