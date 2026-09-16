import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { Alert } from "@/components/ui/alert";
import { AssignmentForm } from "@/features/batches/components/assignment-form";
import { getSession } from "@/features/batches/server/batches-service";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "Set an assignment" };

/**
 * Work set against a session that has actually happened.
 *
 * Invariant 17: a session must be marked DELIVERED first. The API refuses
 * otherwise, and this screen refuses earlier — an operator who fills in a
 * brief and a due date only to be told the session is not delivered has lost
 * the typing and learned nothing they could not have been told up front.
 */
export default async function NewAssignmentPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  await requireModule("batches", "edit");
  const { sessionId } = await params;
  const session = await getSession(sessionId);

  if (session.status !== "COMPLETED") redirect(`/batches/sessions/${sessionId}`);

  return (
    <PageBody>
      <PageHeader
        eyebrow={session.sessionCode}
        title="Set an assignment"
        description={session.title}
        breadcrumbs={[
          { label: "Batches", href: "/batches" },
          { label: session.sessionCode, href: `/batches/sessions/${sessionId}` },
          { label: "New assignment" },
        ]}
      />

      <Alert intent="info" title="It hangs off this session">
        The session is the unit that actually happened on a given day, so work belongs to it rather
        than to the batch in general. Students on this roster see it as soon as it is set.
      </Alert>

      <AssignmentForm sessionId={sessionId} />
    </PageBody>
  );
}
