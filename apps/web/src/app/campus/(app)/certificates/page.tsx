import type { Metadata } from "next";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { StatusPill } from "@/components/ui/status-pill";
import { CampusCard, CampusField, CampusPage, CampusStat } from "@/features/campus/components/campus-page";
import { SubmissionForm } from "@/features/campus/components/submission-form";
import { campusDate } from "@/features/campus/format";
import {
  listBatches,
  listCertificates,
  listSubmissions,
} from "@/features/campus/server/campus-service";
import { requireCollegeUser } from "@/server/principal";
import { verifyPath } from "@/lib/safe-path";

export const metadata: Metadata = { title: "Certificates — Gurukulam" };

/**
 * The college half of invariant 7.
 *
 * ── The asymmetry, from this side ──────────────────────────────────────
 *
 * Eligibility is identical across segments; ACCESS is not. A retail student
 * downloads their own certificate. A college student never does — the record,
 * the number and the verification code are theirs in both segments, and only the
 * FILE is the institution's. Their portal says "your college holds it"; this
 * screen is the office that holds it.
 *
 * Every download therefore goes through the route handler beside this page,
 * which asks `certificateAccess` on the API. Linking to `pdfUrl` from here would
 * work today and would be a second copy of the rule — and two copies of that
 * asymmetry is how the admin download comes to refuse a college student while a
 * portal quietly hands them a link.
 *
 * ── Why revoked certificates stay on the list ──────────────────────────
 *
 * With their reason. A certificate that disappears is one a student is still
 * carrying a photocopy of, and the institution handing it out needs to know it
 * will not pass verification.
 */
export default async function CampusCertificatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireCollegeUser();
  const [certificates, submissions, batches, query] = await Promise.all([
    listCertificates(),
    listSubmissions(),
    listBatches(),
    searchParams,
  ]);

  const issued = certificates.filter((certificate) => certificate.status === "ISSUED");
  const revoked = certificates.filter((certificate) => certificate.status === "REVOKED");
  const underReview = submissions.filter(
    (submission) => submission.status === "SUBMITTED" || submission.status === "UNDER_REVIEW",
  );
  const finished = batches.filter((batch) => batch.status === "COMPLETED");

  return (
    <CampusPage
      eyebrow="Certificates"
      title="Your students' certificates"
      description="Issued to your students, and held by you to hand out."
    >
      {query["submitted"] === "1" ? (
        <Alert intent="success" title="List received">
          We check each name against the cohort's attendance and marks. Nothing is issued until that
          is done.
        </Alert>
      ) : typeof query["pending"] === "string" ? (
        <Alert intent="info" title="No printed copy online yet">
          {query["pending"]} has been issued and the file is not uploaded yet. The office can send
          it — and the verification code below already proves the certificate.
        </Alert>
      ) : typeof query["refused"] === "string" ? (
        <Alert intent="danger" title="That certificate could not be fetched">
          {query["refused"]}
        </Alert>
      ) : null}

      <CampusCard>
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
          <CampusStat label="Issued" value={issued.length} intent="success" caption="Yours to hand out" />
          <CampusStat
            label="Lists under review"
            value={underReview.length}
            intent={underReview.length > 0 ? "waiting" : "neutral"}
            caption="We check each name"
          />
          <CampusStat label="Withdrawn" value={revoked.length} caption="Will not verify" />
        </div>
      </CampusCard>

      {finished.length === 0 ? null : (
        <CampusCard title="Put names forward">
          <p className="mb-4 text-body-sm text-ink-muted">
            When a cohort finishes, send us the students you believe have completed it. We check each
            name against the attendance floor and the marks before anything is issued.
          </p>
          <SubmissionForm batches={finished} />
        </CampusCard>
      )}

      {submissions.length === 0 ? null : (
        <CampusCard title="Lists you have sent">
          <ul className="flex flex-col divide-y divide-hairline">
            {submissions.map((submission) => (
              <li key={submission.submissionId} className="flex min-w-0 flex-col gap-1 py-3 first:pt-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="font-mono text-caption text-ink">
                    {submission.batchCode ?? submission.batchId.slice(0, 8)}
                  </span>
                  <StatusPill
                    intent={
                      submission.status === "RELEASED"
                        ? "success"
                        : submission.status === "REJECTED"
                          ? "danger"
                          : "info"
                    }
                  >
                    {submission.status.replace(/_/g, " ").toLowerCase()}
                  </StatusPill>
                </div>
                <p className="text-body-sm text-ink-muted">
                  {submission.rowCount ?? 0} names, sent {campusDate(submission.submittedAt)}
                  {submission.approvedCount === undefined
                    ? ""
                    : ` · ${submission.approvedCount} approved`}
                  {submission.rejectedCount === undefined || submission.rejectedCount === 0
                    ? ""
                    : `, ${submission.rejectedCount} not`}
                </p>
              </li>
            ))}
          </ul>
        </CampusCard>
      )}

      {certificates.length === 0 ? (
        <CampusCard>
          <EmptyState
            title="No certificates yet"
            description="They appear here once a cohort finishes and we have checked the names you put forward."
          />
        </CampusCard>
      ) : (
        <CampusCard title="Certificates">
          <ul className="flex flex-col divide-y divide-hairline">
            {certificates.map((certificate) => {
              const withdrawn = certificate.status === "REVOKED";
              return (
                <li key={certificate.certificateId} className="flex min-w-0 flex-col gap-3 py-4 first:pt-0">
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <p className="text-body font-semibold break-words text-ink">
                        {certificate.studentName ?? "A student"}
                      </p>
                      <p className="font-mono text-caption text-ink-subtle">
                        {certificate.studentCode ?? ""} · {certificate.certificateNumber}
                      </p>
                    </div>
                    {withdrawn ? (
                      <StatusPill intent="danger">withdrawn</StatusPill>
                    ) : (
                      <StatusPill intent="success">issued</StatusPill>
                    )}
                  </div>

                  <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <CampusField label="Course" value={certificate.courseName} />
                    <CampusField
                      label={withdrawn ? "Withdrawn" : "Issued"}
                      value={
                        withdrawn
                          ? certificate.revokedAt === null
                            ? null
                            : campusDate(certificate.revokedAt)
                          : certificate.issuedDate === null
                            ? null
                            : campusDate(certificate.issuedDate)
                      }
                    />
                    {/* The code is the student's as much as the college's, and it
                        is what an employer checks. It survives a withdrawal on
                        the record and stops being shown, because handing out a
                        code that now fails verification is worse than not
                        having one. */}
                    {withdrawn ? (
                      <CampusField label="Verification" value="No longer valid" />
                    ) : (
                      <CampusField label="Verification code" value={certificate.verificationCode} mono />
                    )}
                  </dl>

                  {withdrawn ? (
                    <p className="rounded-well bg-danger/5 p-3 text-body-sm text-danger">
                      {certificate.revokedReason ??
                        "This certificate has been withdrawn and will not pass verification."}
                    </p>
                  ) : (
                    <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
                      {/* Through the route handler, so the access rule is asked
                          on every click rather than trusted from the list. */}
                      <Link
                        href={`/campus/certificates/${certificate.certificateId}/download`}
                        className="flex items-center gap-2 text-body-sm font-medium text-brand underline-offset-4 hover:underline"
                      >
                        <Icon name="down" size={18} />
                        Download it
                      </Link>
                      <a
                        href={verifyPath(certificate.verificationCode)}
                        className="text-body-sm text-ink-muted underline-offset-4 hover:underline"
                      >
                        See what an employer sees
                      </a>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </CampusCard>
      )}
    </CampusPage>
  );
}
