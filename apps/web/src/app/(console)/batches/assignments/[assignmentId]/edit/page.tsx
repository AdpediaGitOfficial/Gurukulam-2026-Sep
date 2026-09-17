import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { AssignmentForm } from "@/features/batches/components/assignment-form";
import { getSession } from "@/features/batches/server/batches-service";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "Edit an assignment" };

/**
 * Correcting work already set.
 *
 * The assignment is reached through its SESSION rather than fetched on its
 * own, because there is no single-assignment endpoint and the session detail
 * already carries them. `?sessionId=` names which one — the session is not
 * derivable from an assignment id without a read the API does not offer.
 *
 * The session itself is not editable here. Moving an assignment to another day
 * would move it away from the delivery it belongs to and the students who
 * already have it, which is why the contract omits it from the update.
 */
export default async function EditAssignmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ assignmentId: string }>;
  searchParams: Promise<{ sessionId?: string | string[] }>;
}) {
  await requireModule("batches", "edit");
  const { assignmentId } = await params;
  const query = await searchParams;
  const sessionId = Array.isArray(query.sessionId) ? query.sessionId[0] : query.sessionId;
  if (sessionId === undefined || sessionId === "") notFound();

  const session = await getSession(sessionId);
  const assignment = session.assignments.find((a) => a.assignmentId === assignmentId);
  // Reached with an assignment that is not on this session: a 404 rather than
  // a form that would edit something the operator is not looking at.
  if (assignment === undefined) notFound();

  return (
    <PageBody>
      <PageHeader
        eyebrow={assignment.assignmentCode}
        title="Edit assignment"
        description={`${session.sessionCode} · ${session.title}`}
        breadcrumbs={[
          { label: "Batches", href: "/batches" },
          { label: session.sessionCode, href: `/batches/sessions/${sessionId}` },
          { label: assignment.title },
        ]}
      />

      <AssignmentForm sessionId={sessionId} assignment={assignment} />
    </PageBody>
  );
}
