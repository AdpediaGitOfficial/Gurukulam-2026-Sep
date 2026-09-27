import type { Metadata } from "next";
import Link from "next/link";
import type { Submission } from "@gurukulam/contracts";

import { ListFilters } from "@/components/patterns/list-filters";
import { ListPage } from "@/components/patterns/list-page";
import { Column, DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { StatusPill } from "@/components/ui/status-pill";
import { listSubmissions } from "@/features/certificates/server/certificates-service";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";
import { pageSummary, withParam } from "@/lib/href";

export const metadata: Metadata = { title: "Certificate lists" };

const STATUS = {
  SUBMITTED: { intent: "info", label: "Submitted" },
  UNDER_REVIEW: { intent: "warning", label: "Under review" },
  APPROVED: { intent: "success", label: "Approved" },
  REJECTED: { intent: "danger", label: "Rejected" },
  RELEASED: { intent: "success", label: "Released" },
} as const;

const COLUMNS: Column<Submission>[] = [
  {
    id: "college",
    header: "College",
    cell: (row) => (
      <Link href={`/colleges/submissions/${row.submissionId}`} className="flex flex-col hover:underline">
        <span className="text-body font-semibold text-ink">{row.collegeName ?? "—"}</span>
        <span className="font-mono text-caption text-ink-subtle">{row.batchCode ?? "—"}</span>
      </Link>
    ),
  },
  {
    id: "names",
    header: "Names",
    align: "end",
    cell: (row) => (
      <span className="text-body tabular-nums text-ink">{row.rowCount ?? 0}</span>
    ),
  },
  {
    id: "decided",
    header: "Decided",
    // The three counts, not a percentage: an operator wants to know how many
    // are still waiting on them, and a bar cannot say "four".
    cell: (row) => (
      <div className="flex flex-col text-caption tabular-nums">
        <span className="text-success-text">{row.approvedCount ?? 0} approved</span>
        <span className="text-danger">{row.rejectedCount ?? 0} rejected</span>
        <span className="text-ink-muted">{row.pendingCount ?? 0} still to decide</span>
      </div>
    ),
  },
  {
    id: "submitted",
    header: "Submitted",
    cell: (row) => (
      <span className="text-body text-ink-muted">
        {new Date(row.submittedAt).toLocaleDateString("en-IN")}
      </span>
    ),
  },
  {
    id: "status",
    header: "Status",
    cell: (row) => {
      const status = STATUS[row.status];
      return (
        <div className="flex flex-col gap-1">
          <StatusPill intent={status.intent}>{status.label}</StatusPill>
          {row.releasedAt === null ? null : (
            <span className="text-caption text-ink-subtle">
              released {new Date(row.releasedAt).toLocaleDateString("en-IN")}
            </span>
          )}
        </div>
      );
    },
  },
  {
    id: "act",
    header: "",
    align: "end",
    cell: (row) => (
      <Link
        href={`/colleges/submissions/${row.submissionId}`}
        className="text-body text-gold underline-offset-4 hover:underline"
      >
        {(row.pendingCount ?? 0) > 0 ? "Review" : "Open"}
      </Link>
    ),
  },
];

/**
 * The lists colleges send, and the queue where somebody checks them.
 *
 * Invariant 18: a certificate reaches a college ONLY through an approved
 * submission. An uploaded name is a claim, not an outcome — so this queue sits
 * between the two, and nothing on it becomes a certificate until a row is
 * approved and the submission released.
 *
 * Grouped under Colleges rather than beside the certificate register, because
 * the thing being tracked is an institution's request. It sits next to
 * Requirements for the same reason.
 */
export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("certificates");
  const params = await searchParams;
  const page = await listSubmissions(params);

  return (
    <ListPage
      eyebrow="Colleges"
      title="Certificate lists"
      description="A college sends the names it wants certified. Nothing here is a certificate until a row is approved and the list released."
      toolbar={
        <ListFilters
          params={params}
          searchPlaceholder="Search by college or training…"
          selects={[
            {
              name: "status",
              label: "Status",
              options: [
                { value: "", label: "All statuses" },
                { value: "SUBMITTED", label: "Submitted" },
                { value: "UNDER_REVIEW", label: "Under review" },
                { value: "APPROVED", label: "Approved" },
                { value: "REJECTED", label: "Rejected" },
                { value: "RELEASED", label: "Released" },
              ],
            },
          ]}
        />
      }
      pagination={
        <Pagination
          page={page.page}
          pageCount={page.totalPages}
          hrefForPage={(n) => withParam("/colleges/submissions", params, "page", String(n))}
          summary={pageSummary(page.page, page.pageSize, page.total)}
        />
      }
    >
      <DataTable
        columns={COLUMNS}
        rows={page.rows}
        getRowId={(row) => row.submissionId}
        caption="Certificate lists sent by colleges"
        minWidth="900px"
        empty={
          <EmptyState
            title="No lists yet"
            description="A college sends its list from the college portal, or an admin files one on its behalf from the college's own record."
          />
        }
      />
    </ListPage>
  );
}
