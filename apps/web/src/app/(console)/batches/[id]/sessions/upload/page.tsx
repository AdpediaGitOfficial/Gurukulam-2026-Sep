import type { Metadata } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { SessionUploadPanel } from "@/features/batches/components/session-upload-panel";
import { getBatch } from "@/features/batches/server/batches-service";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "Upload sessions" };

/**
 * A batch's schedule arrives in instalments — the first fortnight now, the rest
 * when the trainer confirms their second month. So this screen ADDS to what the
 * batch already has and has no path that removes anything: retiring a session
 * is a deliberate single act, and a completed one is delivery history that
 * cannot be retired at all.
 */
export default async function UploadSessionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModule("batches", "edit");
  const { id } = await params;
  const batch = await getBatch(id);

  return (
    <PageBody>
      <PageHeader
        eyebrow={batch.batchCode}
        title="Upload sessions"
        description="Some today, the rest when the schedule firms up. An upload adds to this batch — it never replaces what is already scheduled, and nothing is written until you have read the plan."
        breadcrumbs={[
          { label: "Batches", href: "/batches" },
          { label: batch.name, href: `/batches/${batch.batchId}` },
          { label: "Upload sessions" },
        ]}
      />
      <SessionUploadPanel batchId={batch.batchId} batchCode={batch.batchCode} />
    </PageBody>
  );
}
