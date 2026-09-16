import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { Alert } from "@/components/ui/alert";
import {
  SubmissionForm,
  type BatchOption,
} from "@/features/certificates/components/submission-form";
import { getCollege } from "@/features/colleges/server/colleges-service";
import { listBatches } from "@/features/batches/server/batches-service";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "File a certificate list" };

/**
 * An admin filing a college's list on its behalf.
 *
 * The college comes from `?collegeId=` and is resolved through the SERVICE,
 * so scope is applied where it always is (invariant 11) and a pasted id for
 * somebody else's college 404s rather than naming it. The action then takes
 * the college from that route value, never from a posted field — a college id
 * in the form is a way to file a list against an institution you are not
 * looking at.
 *
 * The college portal will file these itself. Until then this is how a list
 * that arrived by email gets into the queue.
 */
export default async function NewSubmissionPage({
  searchParams,
}: {
  searchParams: Promise<{ collegeId?: string | string[] }>;
}) {
  await requireModule("certificates", "edit");
  const params = await searchParams;
  const raw = Array.isArray(params.collegeId) ? params.collegeId[0] : params.collegeId;

  // A list belongs to one institution. Without one there is nothing to file
  // against, and guessing would file it against the wrong college.
  if (raw === undefined || raw === "") redirect("/colleges");

  const college = await getCollege(raw);
  const batches = await listBatches({ collegeId: college.collegeId, pageSize: "200" });
  const options: BatchOption[] = batches.rows.map((batch) => ({
    batchId: batch.batchId,
    batchCode: batch.batchCode,
    name: batch.name,
  }));

  return (
    <PageBody>
      <PageHeader
        eyebrow={college.collegeCode}
        title="File a certificate list"
        description={`The names ${college.name} wants certified. Nothing on it is a certificate until it is reviewed and released.`}
        breadcrumbs={[
          { label: "Colleges", href: "/colleges" },
          { label: college.name, href: `/colleges/${college.collegeId}` },
          { label: "Certificate list" },
        ]}
      />

      <Alert intent="info" title="A list is a claim, not an outcome">
        A certificate reaches a college only through an approved list (invariant 18). Every name
        filed here is checked against the roster, the schedule and the work handed in before
        anything is issued.
      </Alert>

      <SubmissionForm collegeId={college.collegeId} batches={options} />
    </PageBody>
  );
}
