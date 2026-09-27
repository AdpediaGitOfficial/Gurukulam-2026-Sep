import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { SegmentTag } from "@/components/patterns/segment-tag";
import { Alert } from "@/components/ui/alert";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { buttonVariants } from "@/components/ui/button";
import { EligibilityPanel } from "@/features/certificates/components/eligibility-panel";
import { IssueCertificateForm } from "@/features/certificates/components/issue-certificate-form";
import {
  checkEligibility,
  listCertificates,
} from "@/features/certificates/server/certificates-service";
import { getStudent } from "@/features/students/server/students-service";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "Issue a certificate" };

/**
 * Signing a student off for one of their batches.
 *
 * The student comes from the route and the batch from `?batchId=`, so choosing
 * which enrolment to certify is a NAVIGATION rather than a dropdown — the
 * eligibility check runs on the server for the batch in the URL, the result is
 * shareable, and no client component is needed to make the two fields depend
 * on each other.
 *
 * Eligibility is identical across segments (invariant 7); only who may
 * download differs. So this screen issues for a college student exactly as it
 * does for a retail one — but a college's own list of names does NOT come
 * through here. That is a submission, reviewed row by row, because a
 * certificate reaches a college only through an approved one (invariant 18).
 */
export default async function IssueCertificatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ batchId?: string | string[] }>;
}) {
  await requireModule("certificates", "edit");
  const { id } = await params;
  const query = await searchParams;
  const batchId = Array.isArray(query.batchId) ? query.batchId[0] : query.batchId;

  const student = await getStudent(id);
  const name = student.lastName === null ? student.firstName : `${student.firstName} ${student.lastName}`;

  // Already issued, for any of their batches — so a second certificate for the
  // same delivery is a thing somebody has to notice rather than stumble into.
  const existing = await listCertificates({ studentId: id, pageSize: "100" });
  const issuedFor = new Set(existing.rows.filter((c) => c.status !== "REVOKED").map((c) => c.batchId));

  const chosen = batchId === undefined ? undefined : student.batches.find((b) => b.batchId === batchId);
  const eligibility = chosen === undefined ? null : await checkEligibility(id, chosen.batchId);

  return (
    <PageBody>
      <PageHeader
        eyebrow={student.studentCode}
        title="Issue a certificate"
        description={`${name} · ${student.enrolmentChannel === "COLLEGE" ? "the college downloads this" : "the student downloads this"}`}
        breadcrumbs={[
          { label: "Students", href: "/students" },
          { label: name, href: `/students/${id}` },
          { label: "Certificate" },
        ]}
      />

      {student.batches.length === 0 ? (
        <Card padding="none" className="overflow-hidden">
          <div className="p-6">
            <EmptyState
              title="Not in a batch yet"
              description="A certificate names the delivery it certifies, so there is nothing to issue until this student is on a roster."
            />
          </div>
        </Card>
      ) : (
        <div className="grid gap-8 xl:grid-cols-3">
          <div className="flex flex-col gap-6 xl:col-span-1">
            <Card padding="none" className="overflow-hidden">
              <div className="px-6 pt-6">
                <CardHeader
                  as="h2"
                  title="Which enrolment"
                  description="A certificate certifies one delivery, not a person."
                />
              </div>
              <ul className="flex flex-col">
                {student.batches.map((batch) => {
                  const done = issuedFor.has(batch.batchId);
                  const active = batch.batchId === chosen?.batchId;
                  return (
                    <li key={batch.batchId} className="border-b border-hairline last:border-b-0">
                      <Link
                        href={`/students/${id}/certificate?batchId=${batch.batchId}` as Route}
                        className={`flex flex-col gap-1.5 p-4 hover:bg-surface-sunken ${active ? "bg-surface-sunken" : ""}`}
                        aria-current={active ? "true" : undefined}
                      >
                        <span className="text-body font-semibold text-ink">{batch.name}</span>
                        <span className="font-mono text-caption text-ink-subtle">
                          {batch.batchCode} · {batch.courseName ?? "—"}
                        </span>
                        <span className="flex flex-wrap items-center gap-2">
                          <SegmentTag segment={batch.segment} />
                          <StatusPill intent={batch.status === "COMPLETED" ? "success" : "info"}>
                            {batch.status.replace(/_/g, " ").toLowerCase()}
                          </StatusPill>
                          {done ? <StatusPill intent="neutral">Already issued</StatusPill> : null}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>

          <div className="flex flex-col gap-6 xl:col-span-2">
            {chosen === undefined || eligibility === null ? (
              <Alert intent="info" title="Choose an enrolment">
                Pick the batch this certificate is for. Its eligibility is checked against the
                roster, the schedule and the work set before anything can be issued.
              </Alert>
            ) : (
              <>
                {issuedFor.has(chosen.batchId) ? (
                  <Alert
                    intent="warning"
                    title={`${chosen.batchCode} already has a live certificate`}
                    action={
                      <Link
                        href="/students/certificates"
                        className={buttonVariants({ variant: "secondary", size: "sm" })}
                      >
                        See it
                      </Link>
                    }
                  >
                    Issuing a second one gives this student two valid certificates for one
                    delivery. Revoke the first if it is wrong, rather than issuing over it.
                  </Alert>
                ) : null}

                <EligibilityPanel eligibility={eligibility} />

                <IssueCertificateForm
                  studentId={id}
                  batchId={chosen.batchId}
                  eligible={eligibility.eligible}
                />
              </>
            )}
          </div>
        </div>
      )}
    </PageBody>
  );
}
