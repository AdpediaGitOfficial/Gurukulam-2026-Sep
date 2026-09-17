import type { Metadata } from "next";
import { can } from "@gurukulam/contracts";
import Link from "next/link";

import { DetailRow } from "@/components/patterns/detail-row";
import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { SegmentTag } from "@/components/patterns/segment-tag";
import { Alert } from "@/components/ui/alert";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { RevokeCertificateForm } from "@/features/certificates/components/revoke-certificate-form";
import { getCertificate } from "@/features/certificates/server/certificates-service";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "Certificate" };

const STATUS = {
  ISSUED: { intent: "success", label: "Issued" },
  DRAFT: { intent: "warning", label: "Draft" },
  REVOKED: { intent: "danger", label: "Revoked" },
} as const;

/**
 * One certificate, and the two things you can still do to it.
 *
 * The verification code is shown beside the number because they are DIFFERENT
 * things and get confused: the number is the identity printed on the document,
 * the code is what the public verifier accepts. Anyone holding the paper can
 * check it without an account, and a revocation shows there the moment it
 * happens.
 */
export default async function CertificatePage({
  params,
  searchParams,
}: {
  params: Promise<{ certificateId: string }>;
  searchParams: Promise<{ issued?: string; revoked?: string }>;
}) {
  const principal = await requireModule("certificates");
  const { certificateId } = await params;
  const flags = await searchParams;
  const certificate = await getCertificate(certificateId);
  const status = STATUS[certificate.status];

  const mayEdit = can(principal, "certificates", "edit");

  return (
    <PageBody>
      <PageHeader
        eyebrow="Certificates"
        title={certificate.certificateNumber}
        description={`${certificate.studentName ?? "Unknown student"} · ${certificate.courseName ?? "—"}`}
        breadcrumbs={[
          { label: "Students", href: "/students" },
          { label: "Certificates", href: "/students/certificates" },
          { label: certificate.certificateNumber },
        ]}
      />

      {flags.issued === "1" ? (
        <Alert intent="success" title="Issued">
          {certificate.certificateNumber} is live on the public verifier now.
        </Alert>
      ) : null}
      {flags.revoked === "1" ? (
        <Alert intent="warning" title="Revoked">
          The public verifier reports it as revoked from this moment. The number is not reused.
        </Alert>
      ) : null}

      <div className="grid gap-8 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            as="h2"
            title="What it certifies"
            action={<StatusPill intent={status.intent}>{status.label}</StatusPill>}
          />

          <dl>
            <DetailRow label="Certificate number" value={certificate.certificateNumber} variant="code" />
            <DetailRow label="Verification code" value={certificate.verificationCode} variant="code" />
            <DetailRow
              label="Student"
              value={certificate.studentName ?? "—"}
              href={`/students/${certificate.studentId}`}
            />
            <DetailRow label="Course" value={certificate.courseName ?? "—"} />
            <DetailRow
              label="Batch"
              value={certificate.batchCode ?? "—"}
              variant="code"
              href={`/batches/${certificate.batchId}`}
            />
            <DetailRow
              label="Issued"
              value={
                certificate.issuedDate === null
                  ? "—"
                  : new Date(certificate.issuedDate).toLocaleDateString("en-IN")
              }
            />
            {certificate.revokedAt === null ? null : (
              <>
                <DetailRow
                  label="Revoked"
                  value={new Date(certificate.revokedAt).toLocaleString("en-IN")}
                />
                <DetailRow label="Reason" value={certificate.revokedReason ?? "—"} />
              </>
            )}
          </dl>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader as="h2" title="Who downloads it" />
            {certificate.segment === undefined ? (
              <p className="text-body-sm text-ink-muted">Segment not reported.</p>
            ) : (
              <>
                <SegmentTag segment={certificate.segment} />
                <p className="mt-3 text-body-sm text-ink-muted">
                  {certificate.segment === "RETAIL"
                    ? "A retail student downloads their own certificate from the student portal."
                    : "The institution downloads this for its student — a college student does not fetch their own (invariant 7)."}
                </p>
              </>
            )}
            {certificate.submissionRowId === null ? (
              <p className="mt-4 border-t border-hairline pt-4 text-body-sm text-ink-muted">
                Issued directly by an admin rather than through a college&rsquo;s list.
              </p>
            ) : (
              <p className="mt-4 border-t border-hairline pt-4 text-body-sm text-ink-muted">
                Produced by an approved row on a college submission — which is the only way a
                certificate reaches a college (invariant 18).
              </p>
            )}
          </Card>

          {/* Revocation is the only remaining write, and an already-revoked
              certificate has nothing left to do — showing the form would be
              offering an action the API refuses. */}
          {mayEdit && certificate.status !== "REVOKED" ? (
            <RevokeCertificateForm
              certificateId={certificate.certificateId}
              certificateNumber={certificate.certificateNumber}
            />
          ) : null}
        </div>
      </div>
    </PageBody>
  );
}
