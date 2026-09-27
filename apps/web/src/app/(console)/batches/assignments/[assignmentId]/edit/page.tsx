import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { AssignmentForm } from "@/features/batches/components/assignment-form";
import { getAssignment, getSession } from "@/features/batches/server/batches-service";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "Edit an assignment" };

/**
 * Correcting work already set.
 *
 * The assignment is fetched on its own, and its session comes from the record
 * rather than from a query string. It used to be the other way round — there
 * was no single-assignment endpoint, so the URL carried `?sessionId=` and 404d
 * whenever it was reloaded or pasted. A page that only works when you arrive
 * by clicking is a page nobody can bookmark, which is how the link audit found
 * it.
 *
 * The session itself is not editable here. Moving an assignment to another day
 * would move it away from the delivery it belongs to and the students who
 * already have it, which is why the contract omits it from the update.
 */
export default async function EditAssignmentPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  await requireModule("batches", "edit");
  const { assignmentId } = await params;

  const assignment = await getAssignment(assignmentId);
  /* An assignment with no session predates invariant 17 or was written around
     it. There is nothing sensible to edit it against — the form's every action
     revalidates the session page — so this refuses rather than guessing. */
  const { sessionId } = assignment;
  if (sessionId === null) notFound();

  const session = await getSession(sessionId);

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
