import type { Metadata } from "next";
import {
  formatRupees,
  fromWire,
  outstandingRowSchema,
  type OutstandingRow,
} from "@gurukulam/contracts";

import { ReportPage } from "@/components/patterns/report-page";
import { SegmentTag } from "@/components/patterns/segment-tag";
import { Card } from "@/components/ui/card";
import { Column, DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { runReport } from "@/features/reports/server/reports-service";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";

export const metadata: Metadata = { title: "Outstanding & ageing" };

const BUCKETS: Record<OutstandingRow["bucket"], { label: string; className: string }> = {
  CURRENT: { label: "Not yet due", className: "bg-success/10 text-success-strong" },
  D1_30: { label: "0–30 days", className: "bg-accent/20 text-gold" },
  D31_60: { label: "31–60 days", className: "bg-warning/15 text-warning-strong" },
  D61_90: { label: "61–90 days", className: "bg-warning/25 text-warning-strong" },
  D90_PLUS: { label: "90+ days", className: "bg-danger/10 text-danger" },
};

const money = (minor: string) => formatRupees(fromWire(minor), { paise: false });

const COLUMNS: Column<OutstandingRow>[] = [
  {
    id: "parent",
    header: "Owed by",
    // One installment engine, two parents: a schedule hangs off either a
    // student ledger or a college contract, never both.
    cell: (row) => (
      <div className="flex flex-col gap-1">
        <span className="text-body font-semibold text-ink">{row.parentName}</span>
        <span className="font-mono text-caption text-ink-subtle">{row.reference}</span>
        <SegmentTag segment={row.parentType === "STUDENT" ? "RETAIL" : "COLLEGE"} />
      </div>
    ),
  },
  { id: "course", header: "Course", cell: (row) => row.courseName ?? <span className="text-ink-subtle">—</span> },
  {
    id: "total",
    header: "Billed",
    align: "end",
    cell: (row) => <span className="font-mono tabular-nums">{money(row.totalMinor)}</span>,
  },
  {
    id: "paid",
    header: "Paid",
    align: "end",
    cell: (row) => (
      <span className="font-mono text-success-strong tabular-nums">{money(row.paidMinor)}</span>
    ),
  },
  {
    id: "outstanding",
    header: "Outstanding",
    align: "end",
    cell: (row) => (
      <span className="font-mono font-semibold text-warning-strong tabular-nums">
        {money(row.outstandingMinor)}
      </span>
    ),
  },
  {
    id: "bucket",
    header: "Ageing",
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
    id: "days",
    header: "Days past due",
    align: "end",
    // Measured on the OLDEST unpaid installment, not the next one — that is
    // what says how long this account has actually been in trouble.
    cell: (row) =>
      row.oldestOverdueDays === 0 ? (
        <span className="text-ink-subtle">—</span>
      ) : (
        <span className="font-semibold text-danger tabular-nums">{row.oldestOverdueDays}</span>
      ),
  },
  {
    id: "next",
    header: "Next due",
    cell: (row) =>
      row.nextDueDate === null ? (
        <span className="text-ink-subtle">—</span>
      ) : (
        <span className="text-body-sm text-ink-muted">
          {new Date(row.nextDueDate).toLocaleDateString("en-IN")}
        </span>
      ),
  },
];

export default async function OutstandingReportPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("reports");
  const params = await searchParams;
  const report = await runReport("outstanding", outstandingRowSchema, params);

  return (
    <ReportPage
      eyebrow="Reports · Money"
      title="Outstanding & ageing"
      description="What is owed and how long it has been owed. Retail ledgers and institutional contracts side by side, because the two age differently."
      meta={report.meta}
      measures={report.measures}
      params={params}
    >
      <Card padding="none" className="overflow-hidden">
        <DataTable
          columns={COLUMNS}
          rows={report.rows}
          getRowId={(row) => `${row.parentType}:${row.parentId}:${row.reference}`}
          caption="Outstanding balances by parent, ageing bucket and days past due"
          minWidth="1400px"
          empty={
            <EmptyState
              title="Nothing outstanding in this window"
              description="Every scheduled installment inside these dates has been collected."
            />
          }
        />
      </Card>
    </ReportPage>
  );
}
