import type { Metadata } from "next";
import Link from "next/link";
import type { Certificate } from "@gurukulam/contracts";

import { ListFilters } from "@/components/patterns/list-filters";
import { PageHeader } from "@/components/patterns/page-header";
import { PageBody, PageSection } from "@/components/patterns/page-section";
import { StatTile, StatTileGrid } from "@/components/patterns/stat-tile";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Column, DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { StatusPill } from "@/components/ui/status-pill";
import { listCertificates } from "@/features/certificates/server/certificates-service";
import { getCollege } from "@/features/colleges/server/colleges-service";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";
import { pageSummary, withParam } from "@/lib/href";
import { brandTokens, feedbackTokens } from "@/design-system/tokens";

export const metadata: Metadata = { title: "College certificates" };

const STATUS: Record<string, { intent: "success" | "warning" | "danger" | "neutral"; label: string }> = {
  ISSUED: { intent: "success", label: "Issued" },
  DRAFT: { intent: "warning", label: "Draft" },
  REVOKED: { intent: "danger", label: "Revoked" },
};

const COLUMNS: Column<Certificate>[] = [
  {
    id: "number",
    header: "Certificate number",
    cell: (row) => (
      <div className="flex flex-col">
        <span className="font-mono text-body-sm text-ink">{row.certificateNumber}</span>
        <span className="font-mono text-caption text-ink-subtle">
          verify: {row.verificationCode}
        </span>
      </div>
    ),
  },
  {
    id: "student",
    header: "Student",
    cell: (row) => (
      <div className="flex flex-col">
        <span className="text-body font-semibold text-ink">{row.studentName ?? "—"}</span>
        {row.studentCode === null || row.studentCode === undefined ? null : (
          <span className="font-mono text-caption text-ink-subtle">{row.studentCode}</span>
        )}
      </div>
    ),
  },
  {
    id: "course",
    header: "Course",
    cell: (row) => (
      <div className="flex flex-col">
        <span className="text-body-sm">{row.courseName ?? "—"}</span>
        {row.batchCode === null || row.batchCode === undefined ? null : (
          <span className="font-mono text-caption text-ink-subtle">{row.batchCode}</span>
        )}
      </div>
    ),
  },
  {
    id: "issued",
    header: "Issued",
    cell: (row) =>
      row.issuedDate === null ? (
        <span className="text-ink-subtle">—</span>
      ) : (
        <span className="text-body-sm text-ink-muted">
          {new Date(row.issuedDate).toLocaleDateString("en-IN")}
        </span>
      ),
  },
  {
    id: "status",
    header: "Status",
    cell: (row) => {
      const status = STATUS[row.status] ?? { intent: "neutral" as const, label: row.status };
      return (
        <div className="flex flex-col gap-1">
          <StatusPill intent={status.intent}>{status.label}</StatusPill>
          {row.revokedReason === null ? null : (
            <span className="text-caption text-ink-subtle">{row.revokedReason}</span>
          )}
        </div>
      );
    },
  },
];

/**
 * One institution's certificates.
 *
 * This screen exists because of invariant 7, and the invariant is the whole
 * point of it: for a college cohort **the institution downloads its students'
 * certificates, and the student does not**. The all-students list at
 * `/students/certificates` can be filtered to a college, but filtering is a
 * thing you remember to do — a college's record should answer "where are our
 * certificates" without anyone having to.
 *
 * Scope is applied inside the service, so a regional sub-admin reaching a
 * college outside their cities gets nothing here rather than a filtered view
 * of somebody else's cohort.
 */
export default async function CollegeCertificatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("certificates");
  const { id } = await params;
  const query = await searchParams;

  // collegeId is forced from the route, never read from the query string: this
  // screen is one institution's, and a pasted ?collegeId= must not turn it
  // into somebody else's.
  const [college, page] = await Promise.all([
    getCollege(id),
    listCertificates({ ...query, collegeId: id }),
  ]);

  const issued = page.rows.filter((row) => row.status === "ISSUED").length;
  const draft = page.rows.filter((row) => row.status === "DRAFT").length;
  const revoked = page.rows.filter((row) => row.status === "REVOKED").length;

  return (
    <PageBody>
      <PageHeader
        eyebrow={college.collegeCode}
        title="Certificates"
        description="Issued to this institution's students on completion — and downloaded by the institution, not by them."
        breadcrumbs={[
          { label: "Colleges", href: "/colleges" },
          { label: college.name, href: `/colleges/${college.collegeId}` },
          { label: "Certificates" },
        ]}
        action={
          /* Where a certificate for this college actually comes FROM
             (invariant 18): a list of names, reviewed row by row. Nothing on
             this screen can be issued from this screen. */
          <div className="flex items-center gap-3">
            <Link
              href={`/colleges/submissions?collegeId=${college.collegeId}`}
              className={buttonVariants({ variant: "secondary" })}
            >
              Certificate lists
            </Link>
            <Link
              href={`/colleges/submissions/new?collegeId=${college.collegeId}`}
              className={buttonVariants({ variant: "primary" })}
            >
              File a list
            </Link>
          </div>
        }
      />

      <Alert intent="info" title="The institution downloads these, not the student">
        A retail student downloads their own certificate. A college student does not — their
        institution does, which is what makes this screen the one that matters for{" "}
        {college.name}. The public verifier resolves each certificate number either way.
      </Alert>

      <StatTileGrid>
        <StatTile
          label="On this page"
          value={String(page.total)}
          caption={pageSummary(page.page, page.pageSize, page.total)}
          icon="seal"
          color={brandTokens.gold}
        />
        <StatTile
          label="Issued"
          value={String(issued)}
          caption="Downloadable by the institution"
          icon="check"
          color={feedbackTokens.success}
        />
        <StatTile
          label="Draft"
          value={String(draft)}
          caption={draft === 0 ? "Nothing awaiting issue" : "Prepared, not yet issued"}
          icon="clock"
          color={draft === 0 ? brandTokens.inkMuted : feedbackTokens.warning}
        />
        <StatTile
          label="Revoked"
          value={String(revoked)}
          caption={revoked === 0 ? "None withdrawn" : "Each carries a stated reason"}
          icon="warn"
          color={revoked === 0 ? brandTokens.inkMuted : feedbackTokens.danger}
        />
      </StatTileGrid>

      <PageSection
        title="Every certificate for this institution"
        description="Counts above describe this page. Use the filters to narrow, or open the all-students list for cross-college comparison."
        action={
          <Link
            href={`/students/certificates?collegeId=${college.collegeId}`}
            className="text-body-sm text-gold underline-offset-4 hover:underline"
          >
            Open in Certificates
          </Link>
        }
      >
        <ListFilters
          params={query}
          searchPlaceholder="Search by student, number or course…"
          selects={[
            {
              name: "status",
              label: "Status",
              options: [
                { value: "", label: "All statuses" },
                { value: "ISSUED", label: "Issued" },
                { value: "DRAFT", label: "Draft" },
                { value: "REVOKED", label: "Revoked" },
              ],
            },
          ]}
        />
        <Card padding="none" className="overflow-hidden">
          <DataTable
            columns={COLUMNS}
            rows={page.rows}
            getRowId={(row) => row.certificateId}
            caption={`Certificates issued to students of ${college.name}`}
            minWidth="1000px"
            empty={
              <EmptyState
                title="No certificates yet"
                description="A certificate is issued when a student completes the course and clears its attendance and marks floors. Nobody from this institution has got there yet."
                action={
                  <Link
                    href={`/students?collegeId=${college.collegeId}`}
                    className="text-body-sm text-gold underline-offset-4 hover:underline"
                  >
                    See this college's students
                  </Link>
                }
              />
            }
          />
          <Pagination
            page={page.page}
            pageCount={page.totalPages}
            hrefForPage={(n) =>
              withParam(`/colleges/${college.collegeId}/certificates`, query, "page", String(n))
            }
            summary={pageSummary(page.page, page.pageSize, page.total)}
          />
        </Card>
      </PageSection>
    </PageBody>
  );
}
