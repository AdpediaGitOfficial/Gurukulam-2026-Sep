import type { Metadata } from "next";
import { unallocatedRowSchema, type UnallocatedRow } from "@gurukulam/contracts";

import { ReportPage } from "@/components/patterns/report-page";
import { SegmentTag } from "@/components/patterns/segment-tag";
import { Card } from "@/components/ui/card";
import { Column, DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { runReport } from "@/features/reports/server/reports-service";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";

export const metadata: Metadata = { title: "Unallocated ageing" };

const BUCKETS: Record<UnallocatedRow["bucket"], { label: string; className: string }> = {
  D0_3: { label: "0–3 days", className: "bg-success/10 text-success-strong" },
  D4_7: { label: "4–7 days", className: "bg-accent/20 text-gold" },
  D8_14: { label: "8–14 days", className: "bg-warning/15 text-warning-strong" },
  D15_PLUS: { label: "15+ days", className: "bg-danger/10 text-danger" },
};

const COLUMNS: Column<UnallocatedRow>[] = [
  {
    id: "student",
    header: "Student",
    cell: (row) => (
      <div className="flex flex-col">
        <span className="text-body font-semibold text-ink">{row.name}</span>
        <span className="text-caption text-ink-subtle">{row.email}</span>
        <span className="font-mono text-caption text-ink-subtle">{row.studentCode}</span>
      </div>
    ),
  },
  { id: "segment", header: "Segment", cell: (row) => <SegmentTag segment={row.segment} /> },
  {
    id: "college",
    header: "College",
    cell: (row) => row.collegeName ?? <span className="text-ink-subtle">—</span>,
  },
  {
    id: "city",
    header: "City",
    cell: (row) => row.cityName ?? <span className="text-ink-subtle">—</span>,
  },
  {
    id: "age",
    header: "Waiting",
    align: "end",
    cell: (row) => (
      <span className="font-semibold tabular-nums">
        {row.ageDays} {row.ageDays === 1 ? "day" : "days"}
      </span>
    ),
  },
  {
    id: "bucket",
    header: "Bucket",
    cell: (row) => {
      const bucket = BUCKETS[row.bucket];
      return (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-caption font-bold ${bucket.className}`}
        >
          {bucket.label}
        </span>
      );
    },
  },
  {
    id: "createdBy",
    header: "Intake",
    // Every record carries its author. A college-created student shows the
    // college user, which is what makes institutional intake auditable.
    cell: (row) => (
      <span className="text-body-sm text-ink-muted">
        {row.createdByType.replace(/_/g, " ").toLowerCase()}
      </span>
    ),
  },
  {
    id: "created",
    header: "Onboarded",
    cell: (row) => (
      <span className="text-body-sm text-ink-muted">
        {new Date(row.createdAt).toLocaleDateString("en-IN")}
      </span>
    ),
  },
];

export default async function UnallocatedReportPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("reports");
  const params = await searchParams;
  const report = await runReport("unallocated", unallocatedRowSchema, params);

  return (
    <ReportPage
      eyebrow="Reports · Enrolment"
      title="Unallocated ageing"
      description="Students onboarded but never put in a batch, bucketed by how long they have waited. The gap between a record existing and revenue starting."
      meta={report.meta}
      measures={report.measures}
      params={params}
    >
      <Card padding="none" className="overflow-hidden">
        <DataTable
          columns={COLUMNS}
          rows={report.rows}
          getRowId={(row) => row.studentId}
          caption="Unallocated students by waiting time and intake channel"
          minWidth="1300px"
          empty={
            <EmptyState
              title="Nobody is waiting"
              description="Every student onboarded in this window is in a batch."
            />
          }
        />
      </Card>
    </ReportPage>
  );
}
