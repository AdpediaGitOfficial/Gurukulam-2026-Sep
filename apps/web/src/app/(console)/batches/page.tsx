import type { Metadata } from "next";
import Link from "next/link";
import type { Batch } from "@gurukulam/contracts";

import { ListFilters } from "@/components/patterns/list-filters";
import { ListPage } from "@/components/patterns/list-page";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { SegmentTag } from "@/components/patterns/segment-tag";
import { Column, DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatusPill } from "@/components/ui/status-pill";
import { listBatches } from "@/features/batches/server/batches-service";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";
import { pageSummary, withParam } from "@/lib/href";
import { formatCount } from "@/lib/format";

export const metadata: Metadata = { title: "Batches" };

const STATUS = {
  SCHEDULED: { intent: "info", label: "Scheduled" },
  IN_PROGRESS: { intent: "info", label: "In progress" },
  COMPLETED: { intent: "success", label: "Completed" },
  CANCELLED: { intent: "danger", label: "Cancelled" },
} as const;

const COLUMNS: Column<Batch>[] = [
  {
    id: "batch",
    header: "Batch",
    cell: (row) => (
      <div className="flex flex-col">
        <span className="text-body font-semibold text-ink">{row.name}</span>
        <span className="font-mono text-caption text-ink-subtle">{row.batchCode}</span>
      </div>
    ),
  },
  {
    id: "course",
    header: "Course",
    cell: (row) => row.courseName ?? <span className="text-ink-subtle">—</span>,
  },
  {
    id: "trainer",
    header: "Trainer",
    cell: (row) =>
      row.primaryTrainerName ?? <span className="text-ink-subtle">Not assigned</span>,
  },
  {
    id: "segment",
    header: "Segment",
    // A batch with a college is dedicated to it; a batch without one is retail.
    // The two rosters never mix (invariant 2).
    cell: (row) => (
      <div className="flex flex-col gap-1">
        <SegmentTag segment={row.segment} />
        {row.collegeName === null || row.collegeName === undefined ? null : (
          <span className="text-caption text-ink-subtle">{row.collegeName}</span>
        )}
      </div>
    ),
  },
  {
    id: "where",
    header: "Where",
    cell: (row) => (
      <span className="text-body-sm text-ink-muted">
        {[row.cityName, row.mode.charAt(0) + row.mode.slice(1).toLowerCase()]
          .filter(Boolean)
          .join(" · ")}
      </span>
    ),
  },
  {
    id: "students",
    header: "Students",
    align: "end",
    cell: (row) => <span className="tabular-nums">{formatCount(row.enrolledCount ?? 0)}</span>,
  },
  {
    id: "progress",
    header: "Sessions done",
    cell: (row) => {
      const total = row.sessionCount ?? 0;
      const done = row.completedSessionCount ?? 0;
      return (
        <div className="flex min-w-32 items-center gap-2">
          <ProgressBar
            value={total === 0 ? 0 : Math.round((done / total) * 100)}
            label={`${row.batchCode}: ${done} of ${total} sessions delivered`}
            hideLabel
            className="flex-1"
          />
          <span className="text-caption text-ink-subtle tabular-nums">
            {done}/{total}
          </span>
        </div>
      );
    },
  },
  {
    id: "status",
    header: "Status",
    cell: (row) => {
      const status = STATUS[row.status];
      return <StatusPill intent={status.intent}>{status.label}</StatusPill>;
    },
  },
];

export default async function BatchesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("batches");
  const params = await searchParams;
  const page = await listBatches(params);

  return (
    <ListPage
      eyebrow="Batches"
      title="Batch management"
      description="A batch with a college is dedicated to it. A batch without one is retail. The two rosters never mix."
      action={
        <Link href="/batches/new" className={buttonVariants({ variant: "primary" })}>
          Create batch
        </Link>
      }
      summary={
        params["created"] === "1" ? (
          <Alert intent="success" title="Created">
            Batch created.
          </Alert>
        ) : null
      }
      toolbar={
        <ListFilters
          params={params}
          searchPlaceholder="Search batches or codes…"
          selects={[
            {
              name: "segment",
              label: "Segment",
              options: [
                { value: "", label: "All segments" },
                { value: "RETAIL", label: "Retail" },
                { value: "COLLEGE", label: "College" },
              ],
            },
            {
              name: "status",
              label: "Status",
              options: [
                { value: "", label: "All statuses" },
                { value: "SCHEDULED", label: "Scheduled" },
                { value: "IN_PROGRESS", label: "In progress" },
                { value: "COMPLETED", label: "Completed" },
                { value: "CANCELLED", label: "Cancelled" },
              ],
            },
          ]}
        />
      }
      pagination={
        <Pagination
          page={page.page}
          pageCount={page.totalPages}
          hrefForPage={(n) => withParam("/batches", params, "page", String(n))}
          summary={pageSummary(page.page, page.pageSize, page.total)}
        />
      }
    >
      <DataTable
        columns={COLUMNS}
        rows={page.rows}
        getRowId={(row) => row.batchId}
        caption="Batches by course, trainer, segment and progress"
        minWidth="1400px"
        empty={
          <EmptyState
            title="No batches match those filters"
            description="Try a broader search term, or clear a filter."
          />
        }
      />
    </ListPage>
  );
}
