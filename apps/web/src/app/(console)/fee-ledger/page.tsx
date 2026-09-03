import type { Metadata } from "next";
import { formatRupees, fromWire, type LedgerSummary } from "@gurukulam/contracts";

import { ListFilters } from "@/components/patterns/list-filters";
import { ListPage } from "@/components/patterns/list-page";
import { Column, DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatusPill } from "@/components/ui/status-pill";
import { listLedgers } from "@/features/ledger/server/ledger-service";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";
import { pageSummary, withParam } from "@/lib/href";

export const metadata: Metadata = { title: "Fee ledger" };

const STATUS = {
  UNPAID: { intent: "neutral", label: "Unpaid" },
  PARTIALLY_PAID: { intent: "warning", label: "Partially paid" },
  PAID_FULL: { intent: "success", label: "Paid in full" },
  OVERDUE: { intent: "danger", label: "Overdue" },
} as const;

/** Money is `bigint` paise from the wire to the formatter — never a float, never a number. */
const money = (minor: string) => formatRupees(fromWire(minor), { paise: false });

const COLUMNS: Column<LedgerSummary>[] = [
  {
    id: "student",
    header: "Student",
    cell: (row) => (
      <div className="flex flex-col">
        <span className="text-body font-semibold text-ink">{row.studentName}</span>
        <span className="font-mono text-caption text-ink-subtle">{row.studentCode}</span>
      </div>
    ),
  },
  {
    id: "course",
    header: "Course",
    cell: (row) => (
      <div className="flex flex-col">
        <span className="text-body-sm">{row.courseName ?? "—"}</span>
        {row.batchCode === null ? null : (
          <span className="font-mono text-caption text-ink-subtle">{row.batchCode}</span>
        )}
      </div>
    ),
  },
  {
    id: "value",
    header: "Enrolment value",
    align: "end",
    cell: (row) => (
      <div className="flex flex-col items-end">
        <span className="font-mono font-semibold tabular-nums">
          {money(row.enrolmentValueMinor)}
        </span>
        {row.discountAmountMinor === null ||
        fromWire(row.discountAmountMinor) === 0n ? null : (
          <span className="font-mono text-caption text-warning-strong tabular-nums">
            −{money(row.discountAmountMinor)}
          </span>
        )}
      </div>
    ),
  },
  {
    id: "paid",
    header: "Paid",
    align: "end",
    cell: (row) => (
      <span className="font-mono text-success-strong tabular-nums">{money(row.totalPaidMinor)}</span>
    ),
  },
  {
    id: "balance",
    header: "Balance",
    align: "end",
    cell: (row) => {
      const balance = fromWire(row.balancePendingMinor);
      return (
        <span
          className={`font-mono tabular-nums ${balance === 0n ? "text-ink-subtle" : "text-warning-strong"}`}
        >
          {money(row.balancePendingMinor)}
        </span>
      );
    },
  },
  {
    id: "installments",
    header: "Installments",
    cell: (row) => (
      <div className="flex min-w-32 items-center gap-2">
        <ProgressBar
          value={
            row.installmentsTotal === 0
              ? 0
              : Math.round((row.installmentsPaid / row.installmentsTotal) * 100)
          }
          label={`${row.studentName}: ${row.installmentsPaid} of ${row.installmentsTotal} installments paid`}
          hideLabel
          className="flex-1"
        />
        <span className="text-caption text-ink-subtle tabular-nums">
          {row.installmentsPaid}/{row.installmentsTotal}
        </span>
      </div>
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
          {row.overdueCount > 0 ? (
            <span className="text-caption text-danger tabular-nums">
              {row.overdueCount} overdue
            </span>
          ) : null}
        </div>
      );
    },
  },
];

export default async function FeeLedgerPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("feeLedger");
  const params = await searchParams;
  const page = await listLedgers(params);

  return (
    <ListPage
      eyebrow="Fee ledger"
      title="Retail fee ledger"
      description="One row per student — the summary. Billing follows segment: a college student has no individual ledger, because the institution is billed under a contract instead."
      toolbar={
        <ListFilters
          params={params}
          searchPlaceholder="Search student, course or batch…"
          selects={[
            {
              name: "status",
              label: "Status",
              options: [
                { value: "", label: "All statuses" },
                { value: "UNPAID", label: "Unpaid" },
                { value: "PARTIALLY_PAID", label: "Partially paid" },
                { value: "PAID_FULL", label: "Paid in full" },
                { value: "OVERDUE", label: "Overdue" },
              ],
            },
            {
              name: "overdueOnly",
              label: "Overdue",
              options: [
                { value: "", label: "All accounts" },
                { value: "true", label: "Overdue only" },
              ],
            },
          ]}
        />
      }
      pagination={
        <Pagination
          page={page.page}
          pageCount={page.totalPages}
          hrefForPage={(n) => withParam("/fee-ledger", params, "page", String(n))}
          summary={pageSummary(page.page, page.pageSize, page.total)}
        />
      }
    >
      <DataTable
        columns={COLUMNS}
        rows={page.rows}
        getRowId={(row) => row.ledgerId}
        caption="Student ledgers by enrolment value, amount paid and balance"
        minWidth="1400px"
        empty={
          <EmptyState
            title="No ledgers match those filters"
            description="Try a broader search term, or clear a filter."
          />
        }
      />
    </ListPage>
  );
}
