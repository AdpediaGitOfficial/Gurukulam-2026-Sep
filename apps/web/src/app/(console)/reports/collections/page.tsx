import type { Metadata } from "next";
import { collectionRowSchema, formatRupees, fromWire, type CollectionRow } from "@gurukulam/contracts";

import { ReportPage } from "@/components/patterns/report-page";
import { SegmentTag } from "@/components/patterns/segment-tag";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Column, DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { runReport } from "@/features/reports/server/reports-service";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";
import { brandTokens } from "@/design-system/tokens";

export const metadata: Metadata = { title: "Collection register" };

const MODE_LABEL: Record<string, string> = {
  UPI: "UPI",
  CREDIT_CARD: "Credit card",
  DEBIT_CARD: "Debit card",
  CASH: "Cash",
  OTHER: "Other",
};

const COLUMNS: Column<CollectionRow>[] = [
  {
    id: "transaction",
    header: "Transaction",
    cell: (row) => (
      <div className="flex flex-col">
        <span className="font-mono text-body-sm text-ink">{row.transactionCode}</span>
        <span className="text-caption text-ink-subtle">
          {new Date(row.paidAt).toLocaleString("en-IN")}
        </span>
      </div>
    ),
  },
  {
    id: "from",
    header: "From",
    cell: (row) => (
      <div className="flex flex-col gap-1">
        <span className="text-body font-semibold text-ink">{row.parentName}</span>
        <span className="font-mono text-caption text-ink-subtle">{row.reference}</span>
        <SegmentTag segment={row.parentType === "STUDENT" ? "RETAIL" : "COLLEGE"} />
      </div>
    ),
  },
  {
    id: "mode",
    header: "Mode",
    // Cash is called out: it is the only mode with no external reference, so
    // it is the one that needs a physical receipt against it before the
    // register can be closed.
    cell: (row) => (
      <Chip color={row.paymentMode === "CASH" ? brandTokens.gold : undefined}>
        {MODE_LABEL[row.paymentMode] ?? row.paymentMode}
      </Chip>
    ),
  },
  {
    id: "reference",
    header: "Reference",
    cell: (row) => (
      <div className="flex flex-col">
        <span className="font-mono text-caption text-ink-muted">
          {row.externalTransactionId ?? "—"}
        </span>
        {row.bankOrHandle === null ? null : (
          <span className="text-caption text-ink-subtle">{row.bankOrHandle}</span>
        )}
      </div>
    ),
  },
  {
    id: "amount",
    header: "Amount",
    align: "end",
    cell: (row) => {
      const amount = fromWire(row.amountMinor);
      return (
        <div className="flex flex-col items-end">
          <span
            className={`font-mono font-semibold tabular-nums ${row.isReversal ? "text-danger" : "text-ink"}`}
          >
            {formatRupees(amount, { paise: false })}
          </span>
          {/* A reversal is an entry in its own right, never an edit to the
              original — which is why it appears here rather than removing a row. */}
          {row.isReversal ? <span className="text-caption text-danger">Reversal</span> : null}
        </div>
      );
    },
  },
];

export default async function CollectionsReportPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("reports");
  const params = await searchParams;
  const report = await runReport("collections", collectionRowSchema, params);

  return (
    <ReportPage
      eyebrow="Reports · Money"
      title="Collection register"
      description="Every receipt logged in the window, with its mode and reference. This is the cash reconciliation sheet."
      meta={report.meta}
      measures={report.measures}
      params={params}
    >
      <Card padding="none" className="overflow-hidden">
        <DataTable
          columns={COLUMNS}
          rows={report.rows}
          getRowId={(row) => row.transactionCode}
          caption="Payments received, by payer, mode and reference"
          minWidth="1200px"
          empty={
            <EmptyState
              title="No receipts in this window"
              description="Nothing was collected between these dates."
            />
          }
        />
      </Card>
    </ReportPage>
  );
}
