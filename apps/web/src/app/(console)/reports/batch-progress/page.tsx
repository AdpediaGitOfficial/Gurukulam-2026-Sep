import type { Metadata } from "next";
import { batchProgressRowSchema, type BatchProgressRow } from "@gurukulam/contracts";

import { ReportPage } from "@/components/patterns/report-page";
import { SegmentTag } from "@/components/patterns/segment-tag";
import { Card } from "@/components/ui/card";
import { Column, DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { runReport } from "@/features/reports/server/reports-service";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";
import { feedbackTokens, brandTokens } from "@/design-system/tokens";
import { formatCount } from "@/lib/format";

export const metadata: Metadata = { title: "Batch progress" };

const COLUMNS: Column<BatchProgressRow>[] = [
  {
    id: "batch",
    header: "Batch",
    cell: (row) => (
      <div className="flex flex-col gap-1">
        <span className="text-body font-semibold text-ink">{row.name}</span>
        <span className="font-mono text-caption text-ink-subtle">{row.batchCode}</span>
        <SegmentTag segment={row.segment} />
      </div>
    ),
  },
  {
    id: "course",
    header: "Course",
    cell: (row) => (
      <div className="flex flex-col">
        <span className="text-body-sm">{row.courseName ?? "—"}</span>
        <span className="text-caption text-ink-subtle">
          {row.collegeName ?? "Retail cohort"}
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
    id: "enrolled",
    header: "Enrolled",
    align: "end",
    cell: (row) => (
      <span className="tabular-nums">
        {formatCount(row.enrolled)}
        {row.capacity === null ? "" : ` / ${formatCount(row.capacity)}`}
      </span>
    ),
  },
  {
    id: "progress",
    header: "Sessions delivered",
    cell: (row) => (
      <div className="flex min-w-40 items-center gap-2">
        <ProgressBar
          value={row.progressPct}
          label={`${row.batchCode}: ${row.sessionsCompleted} of ${row.sessionsTotal} sessions delivered`}
          hideLabel
          color={row.progressPct === 100 ? feedbackTokens.success : brandTokens.brand}
          className="flex-1"
        />
        <span className="text-caption text-ink-subtle tabular-nums">
          {row.sessionsCompleted}/{row.sessionsTotal}
        </span>
      </div>
    ),
  },
  {
    id: "recordings",
    header: "Recording gaps",
    align: "end",
    // A delivered session with no recording is a promise not kept, so it is
    // counted rather than left to be noticed.
    cell: (row) =>
      row.recordingsMissing === 0 ? (
        <span className="text-ink-subtle">—</span>
      ) : (
        <span className="font-semibold text-danger tabular-nums">{row.recordingsMissing}</span>
      ),
  },
  {
    id: "certificates",
    header: "Certificates",
    align: "end",
    cell: (row) => (
      <span className="tabular-nums">{formatCount(row.certificatesIssued)}</span>
    ),
  },
  {
    id: "status",
    header: "Status",
    cell: (row) => (
      <span className="text-body-sm text-ink-muted">
        {row.status.replace(/_/g, " ").toLowerCase()}
      </span>
    ),
  },
];

export default async function BatchProgressReportPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("reports");
  const params = await searchParams;
  const report = await runReport("batch-progress", batchProgressRowSchema, params);

  return (
    <ReportPage
      eyebrow="Reports · Delivery"
      title="Batch progress"
      description="Sessions delivered against plan, with recording coverage and certificates issued per batch."
      meta={report.meta}
      measures={report.measures}
      params={params}
    >
      <Card padding="none" className="overflow-hidden">
        <DataTable
          columns={COLUMNS}
          rows={report.rows}
          getRowId={(row) => row.batchId}
          caption="Batches by sessions delivered, recording coverage and certificates"
          minWidth="1500px"
          empty={
            <EmptyState
              title="No batches ran in this window"
              description="Widen the dates to include batches that started earlier."
            />
          }
        />
      </Card>
    </ReportPage>
  );
}
