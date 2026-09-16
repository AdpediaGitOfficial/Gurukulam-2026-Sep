import type { Metadata } from "next";
import Link from "next/link";
import { can } from "@gurukulam/contracts";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody, PageSection } from "@/components/patterns/page-section";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile, StatTileGrid } from "@/components/patterns/stat-tile";
import { StatusPill } from "@/components/ui/status-pill";
import { brandTokens, feedbackTokens } from "@/design-system/tokens";
import { formatCount } from "@/lib/format";
import { ReleaseSubmissionForm } from "@/features/certificates/components/release-submission-form";
import {
  SubmissionRowForm,
  type RosterOption,
} from "@/features/certificates/components/submission-row-form";
import { getSubmission } from "@/features/certificates/server/certificates-service";
import { listStudents } from "@/features/students/server/students-service";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "Review a certificate list" };

const STATUS = {
  SUBMITTED: { intent: "info", label: "Submitted" },
  UNDER_REVIEW: { intent: "warning", label: "Under review" },
  APPROVED: { intent: "success", label: "Approved" },
  REJECTED: { intent: "danger", label: "Rejected" },
  RELEASED: { intent: "success", label: "Released" },
} as const;

/**
 * The review table — where invariant 18 is actually done.
 *
 * The uploaded name is kept verbatim next to the matched student rather than
 * replaced by it. What the college actually sent is the evidence; the match is
 * an interpretation, and when the two disagree that disagreement is the whole
 * point of reviewing.
 *
 * **Eligibility appears once a row has a matched student, not before.** Filing
 * a list does not match names to records, so a pending row has nobody to
 * evaluate and the API returns no eligibility for it — the blockers come back
 * when the decision names the student. The row form is built around that
 * rather than around a verdict the data cannot supply: it asks, the API
 * answers with what is in the way, and the override appears only then.
 */
export default async function SubmissionReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ submissionId: string }>;
  searchParams: Promise<{ created?: string; released?: string }>;
}) {
  const principal = await requireModule("certificates");
  const { submissionId } = await params;
  const flags = await searchParams;
  const submission = await getSubmission(submissionId);
  const status = STATUS[submission.status];
  const mayEdit = can(principal, "certificates", "edit");

  /* Only students on THIS batch's roster are offered as matches. A college can
     write any name on a list; a certificate has to name somebody who was
     actually enrolled. */
  const enrolled = await listStudents({ batchId: submission.batchId, pageSize: "200" });
  const roster: RosterOption[] = enrolled.rows.map((student) => ({
    studentId: student.studentId,
    studentCode: student.studentCode,
    name: student.lastName === null ? student.firstName : `${student.firstName} ${student.lastName}`,
    email: student.email,
  }));

  const rows = submission.rows ?? [];
  const pending = submission.pendingCount ?? rows.filter((r) => r.status === "PENDING").length;
  const approved = submission.approvedCount ?? rows.filter((r) => r.status === "APPROVED").length;
  const rejected = submission.rejectedCount ?? rows.filter((r) => r.status === "REJECTED").length;
  const released = submission.status === "RELEASED";

  return (
    <PageBody>
      <PageHeader
        eyebrow={submission.collegeName ?? "College"}
        title="Certificate list"
        description={`${submission.batchCode ?? "—"} · sent ${new Date(submission.submittedAt).toLocaleDateString("en-IN")}`}
        breadcrumbs={[
          { label: "Colleges", href: "/colleges" },
          { label: "Certificate lists", href: "/colleges/submissions" },
          { label: submission.batchCode ?? "List" },
        ]}
        action={<StatusPill intent={status.intent}>{status.label}</StatusPill>}
      />

      {flags.created === "1" ? (
        <Alert intent="success" title="List filed">
          Nothing on it is a certificate yet. Decide each name below, then release the list.
        </Alert>
      ) : null}
      {flags.released === "1" ? (
        <Alert intent="success" title="Released">
          The approved names are certificates now, each linked back to the row that produced it.{" "}
          <Link
            href={`/students/certificates?batchId=${submission.batchId}`}
            className="text-gold underline underline-offset-4"
          >
            See them in the register
          </Link>
          .
        </Alert>
      ) : null}

      <StatTileGrid>
        <StatTile
          label="Names sent"
          value={formatCount(rows.length)}
          caption="Verbatim, as the college wrote them"
          icon="users"
          color={brandTokens.brand}
        />
        <StatTile
          label="Approved"
          value={formatCount(approved)}
          caption={released ? "Now certificates" : "Become certificates on release"}
          icon="check"
          color={approved === 0 ? brandTokens.inkMuted : feedbackTokens.success}
        />
        <StatTile
          label="Rejected"
          value={formatCount(rejected)}
          caption="With a reason the college can act on"
          icon="warn"
          color={rejected === 0 ? brandTokens.inkMuted : feedbackTokens.danger}
        />
        <StatTile
          label="Still to decide"
          value={formatCount(pending)}
          caption={pending === 0 ? "Nothing waiting on you" : "Blocks the release"}
          icon="flag"
          color={pending === 0 ? brandTokens.inkMuted : feedbackTokens.warning}
        />
      </StatTileGrid>

      <div className="grid gap-8 xl:grid-cols-3">
        <PageSection
          title="The names"
          description="Kept verbatim, as the college sent them. Eligibility is checked the moment a name is matched to a student."
          className="xl:col-span-2"
        >
          <Card padding="none" className="overflow-hidden">
            {rows.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No names on this list"
                  description="The college filed an empty list, which the API should have refused. Worth a look."
                />
              </div>
            ) : (
              <ul className="flex flex-col">
                {rows.map((row) => (
                  <li
                    key={row.rowId}
                    className="grid gap-4 border-b border-hairline p-4 last:border-b-0 sm:grid-cols-2"
                  >
                    <div className="min-w-0">
                      {/* Verbatim. What the college sent is the evidence; the
                          match below is an interpretation of it. */}
                      <p className="text-body font-semibold text-ink">{row.uploadedName}</p>
                      {row.uploadedEmail === null ? null : (
                        <p className="text-caption text-ink-subtle">{row.uploadedEmail}</p>
                      )}
                      {row.uploadedRef === null ? null : (
                        <p className="font-mono text-caption text-ink-subtle">{row.uploadedRef}</p>
                      )}
                      {row.studentCode === null || row.studentCode === undefined ? null : (
                        <p className="mt-1 font-mono text-caption text-ink-muted">
                          matched to {row.studentCode}
                        </p>
                      )}
                      <Eligibility row={row} />
                    </div>

                    <div className="min-w-0">
                      {mayEdit ? (
                        <SubmissionRowForm
                          submissionId={submissionId}
                          row={row}
                          roster={roster}
                          locked={released}
                        />
                      ) : (
                        <StatusPill intent="neutral">{row.status.toLowerCase()}</StatusPill>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </PageSection>

        <div className="flex flex-col gap-6">
          {released ? (
            <Alert intent="success" title="Already released">
              Certificates were issued on{" "}
              {submission.releasedAt === null
                ? "an earlier date"
                : new Date(submission.releasedAt).toLocaleDateString("en-IN")}
              . A mistake is corrected by revoking the certificate, not by re-deciding the row.
            </Alert>
          ) : mayEdit ? (
            <ReleaseSubmissionForm
              submissionId={submissionId}
              approved={approved}
              pending={pending}
            />
          ) : null}

          <Alert intent="info" title="Why this queue exists">
            A certificate reaches a college only through an approved list. An uploaded name is a
            claim — this is where somebody checks it against the roster, the schedule and the work
            actually handed in.
          </Alert>
        </div>
      </div>
    </PageBody>
  );
}

/**
 * The row's own eligibility, compressed to what decides the answer.
 *
 * Present only once the row HAS a matched student — the API evaluates against
 * a student, and a freshly filed name has none. So for a pending row this says
 * so plainly rather than rendering an empty verdict that reads like a pass.
 */
function Eligibility({ row }: { row: { eligibility?: { eligible: boolean; blockers: string[] } | null } }) {
  const eligibility = row.eligibility;
  if (eligibility === null || eligibility === undefined) {
    return (
      <p className="mt-2 text-caption text-ink-subtle">
        Not checked yet — nothing can be evaluated until this name is matched to a student.
      </p>
    );
  }
  if (eligibility.eligible) {
    return <p className="mt-2 text-caption text-success-text">Clear to approve.</p>;
  }
  return (
    <ul className="mt-2 flex flex-col gap-0.5">
      {eligibility.blockers.map((blocker) => (
        <li key={blocker} className="text-caption text-danger">
          {blocker}
        </li>
      ))}
    </ul>
  );
}
