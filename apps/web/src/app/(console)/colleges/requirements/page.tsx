import type { Metadata } from "next";
import type { Requirement } from "@gurukulam/contracts";

import { ListFilters } from "@/components/patterns/list-filters";
import { ListPage } from "@/components/patterns/list-page";
import { Column, DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { StatusPill } from "@/components/ui/status-pill";
import { listRequirements } from "@/features/requirements/server/requirements-service";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";
import { pageSummary, withParam } from "@/lib/href";
import { formatCount } from "@/lib/format";

export const metadata: Metadata = { title: "Requirements" };

const STATUS: Record<string, { intent: "success" | "info" | "warning" | "danger" | "neutral"; label: string }> = {
  NEW: { intent: "neutral", label: "New" },
  UNDER_REVIEW: { intent: "info", label: "Under review" },
  CONFIRMED: { intent: "success", label: "Confirmed" },
  REJECTED: { intent: "danger", label: "Rejected" },
  FULFILLED: { intent: "success", label: "Fulfilled" },
};

const MODE = { ONLINE: "Online", OFFLINE: "Offline", HYBRID: "Hybrid" } as const;

const dateOnly = (value: string) =>
  new Date(value).toLocaleDateString("en-IN", { month: "short", year: "numeric" });

const COLUMNS: Column<Requirement>[] = [
  {
    id: "requirement",
    header: "Requirement",
    cell: (row) => (
      <div className="flex flex-col">
        <span className="font-mono text-body-sm text-ink">{row.requirementCode}</span>
        <span className="text-caption text-ink-subtle">
          raised {new Date(row.createdAt).toLocaleDateString("en-IN")}
        </span>
      </div>
    ),
  },
  {
    id: "college",
    header: "College",
    cell: (row) => (
      <span className="text-body font-semibold text-ink">{row.collegeName ?? "—"}</span>
    ),
  },
  { id: "course", header: "Course", cell: (row) => row.courseName ?? <span className="text-ink-subtle">—</span> },
  {
    id: "headcount",
    header: "Headcount",
    align: "end",
    cell: (row) => <span className="tabular-nums">{formatCount(row.expectedHeadcount)}</span>,
  },
  { id: "mode", header: "Mode", cell: (row) => MODE[row.preferredMode] },
  {
    id: "window",
    header: "Window",
    cell: (row) =>
      row.preferredWindowStart === null ? (
        <span className="text-ink-subtle">—</span>
      ) : (
        <span className="text-body-sm text-ink-muted">
          {dateOnly(row.preferredWindowStart)}
          {row.preferredWindowEnd === null ? "" : ` – ${dateOnly(row.preferredWindowEnd)}`}
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
          {row.rejectionReason === null ? null : (
            <span className="text-caption text-ink-subtle">{row.rejectionReason}</span>
          )}
        </div>
      );
    },
  },
  {
    id: "batch",
    header: "Batch produced",
    // Confirming a requirement is what creates its dedicated batch, so the link
    // back to it is the evidence that the flow completed.
    cell: (row) =>
      row.batchCode === null || row.batchCode === undefined ? (
        <span className="text-ink-subtle">—</span>
      ) : (
        <span className="font-mono text-body-sm text-brand">{row.batchCode}</span>
      ),
  },
];

export default async function RequirementsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("requirements");
  const params = await searchParams;
  const page = await listRequirements(params);

  return (
    <ListPage
      eyebrow="Colleges"
      title="Training requirements"
      description="The demand record that starts a college engagement. Confirming one is what creates its dedicated batch."
      toolbar={
        <ListFilters
          params={params}
          searchPlaceholder="Search requirements…"
          selects={[
            {
              name: "status",
              label: "Status",
              options: [
                { value: "", label: "All statuses" },
                { value: "NEW", label: "New" },
                { value: "UNDER_REVIEW", label: "Under review" },
                { value: "CONFIRMED", label: "Confirmed" },
                { value: "REJECTED", label: "Rejected" },
              ],
            },
          ]}
        />
      }
      pagination={
        <Pagination
          page={page.page}
          pageCount={page.totalPages}
          hrefForPage={(n) => withParam("/colleges/requirements", params, "page", String(n))}
          summary={pageSummary(page.page, page.pageSize, page.total)}
        />
      }
    >
      <DataTable
        columns={COLUMNS}
        rows={page.rows}
        getRowId={(row) => row.requirementId}
        caption="College training requirements and the batches they produced"
        minWidth="1350px"
        empty={
          <EmptyState
            title="No requirements match those filters"
            description="A college raises a requirement; confirming it creates the batch."
          />
        }
      />
    </ListPage>
  );
}
