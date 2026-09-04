import type { Metadata } from "next";
import type { BatchSession } from "@gurukulam/contracts";

import { ListFilters } from "@/components/patterns/list-filters";
import { ListPage } from "@/components/patterns/list-page";
import { Column, DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Pagination } from "@/components/ui/pagination";
import { StatusPill } from "@/components/ui/status-pill";
import { listSessions } from "@/features/batches/server/batches-service";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";
import { pageSummary, withParam } from "@/lib/href";

export const metadata: Metadata = { title: "Sessions" };

const STATUS = {
  SCHEDULED: { intent: "info", label: "Scheduled" },
  LIVE: { intent: "warning", label: "Live" },
  COMPLETED: { intent: "success", label: "Completed" },
  CANCELLED: { intent: "danger", label: "Cancelled" },
} as const;

const MODE = { ONLINE: "Online", OFFLINE: "Offline", HYBRID: "Hybrid" } as const;

const COLUMNS: Column<BatchSession>[] = [
  {
    id: "session",
    header: "Session / topic",
    cell: (row) => (
      <div className="flex flex-col">
        <span className="text-body font-semibold text-ink">{row.title}</span>
        <span className="text-caption text-ink-subtle">
          {row.topicTitle ?? "No topic"} · #{row.sequence}
        </span>
      </div>
    ),
  },
  {
    id: "batch",
    header: "Batch",
    cell: (row) => (
      <span className="font-mono text-body-sm text-ink-muted">{row.batchCode ?? "—"}</span>
    ),
  },
  {
    id: "when",
    header: "Date & time",
    cell: (row) => (
      <div className="flex flex-col">
        <span className="text-body-sm">
          {new Date(row.scheduledDate).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </span>
        <span className="font-mono text-caption text-ink-subtle tabular-nums">
          {row.startTime}–{row.endTime}
        </span>
      </div>
    ),
  },
  {
    id: "trainer",
    header: "Trainer",
    cell: (row) => row.trainerName ?? <span className="text-ink-subtle">Not assigned</span>,
  },
  {
    id: "where",
    header: "Where",
    cell: (row) => (
      <span className="text-body-sm text-ink-muted">
        {[MODE[row.mode], row.venue].filter(Boolean).join(" · ")}
      </span>
    ),
  },
  {
    id: "assignments",
    header: "Assignments",
    align: "end",
    // A session must be marked complete before assignments can be set against
    // it, so a scheduled session showing none is correct rather than missing.
    cell: (row) =>
      row.assignmentCount === undefined || row.assignmentCount === 0 ? (
        <span className="text-ink-subtle">—</span>
      ) : (
        <span className="tabular-nums">{row.assignmentCount}</span>
      ),
  },
  {
    id: "recording",
    header: "Recording",
    cell: (row) =>
      row.hasRecording === true ? (
        <span className="inline-flex items-center gap-1.5 text-body-sm text-success-strong">
          <Icon name="yt" size={15} />
          Linked
        </span>
      ) : row.status === "COMPLETED" ? (
        <span className="text-body-sm text-warning-strong">Missing</span>
      ) : (
        <span className="text-ink-subtle">—</span>
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
          {row.rescheduledFrom === null ? null : (
            <span className="text-caption text-ink-subtle" title={row.rescheduleReason ?? undefined}>
              rescheduled
            </span>
          )}
        </div>
      );
    },
  },
];

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("batches");
  const params = await searchParams;
  const page = await listSessions(params);

  return (
    <ListPage
      eyebrow="Batches"
      title="Sessions"
      description="Every session across every batch. A session sits under a topic; assignments and the recording hang off it, because the session is the unit that actually happens on a given day."
      toolbar={
        <ListFilters
          params={params}
          searchPlaceholder="Search sessions or batch codes…"
          selects={[
            {
              name: "status",
              label: "Status",
              options: [
                { value: "", label: "All statuses" },
                { value: "SCHEDULED", label: "Scheduled" },
                { value: "LIVE", label: "Live" },
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
          hrefForPage={(n) => withParam("/batches/sessions", params, "page", String(n))}
          summary={pageSummary(page.page, page.pageSize, page.total)}
        />
      }
    >
      <DataTable
        columns={COLUMNS}
        rows={page.rows}
        getRowId={(row) => row.sessionId}
        caption="Sessions by batch, schedule, trainer and delivery state"
        minWidth="1500px"
        empty={
          <EmptyState
            title="No sessions match those filters"
            description="Sessions are scheduled under a batch's course topics."
          />
        }
      />
    </ListPage>
  );
}
