import type { Metadata } from "next";
import { formatRupees, fromWire, type Contract } from "@gurukulam/contracts";

import { ListFilters } from "@/components/patterns/list-filters";
import { ListPage } from "@/components/patterns/list-page";
import { Column, DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { StatusPill } from "@/components/ui/status-pill";
import { listContracts } from "@/features/ledger/server/ledger-service";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";
import { pageSummary, withParam } from "@/lib/href";
import { formatCount } from "@/lib/format";

export const metadata: Metadata = { title: "Institutional contracts" };

const STATUS = {
  DRAFT: { intent: "neutral", label: "Draft" },
  ACTIVE: { intent: "info", label: "Active" },
  PAID: { intent: "success", label: "Paid in full" },
  CANCELLED: { intent: "danger", label: "Cancelled" },
} as const;

const money = (minor: string | null) =>
  minor === null ? "—" : formatRupees(fromWire(minor), { paise: false });

const COLUMNS: Column<Contract>[] = [
  {
    id: "contract",
    header: "Contract",
    cell: (row) => (
      <div className="flex flex-col">
        <span className="font-mono text-body-sm text-ink">{row.contractCode}</span>
        {row.batchCode === null || row.batchCode === undefined ? null : (
          <span className="font-mono text-caption text-ink-subtle">{row.batchCode}</span>
        )}
      </div>
    ),
  },
  {
    id: "college",
    header: "College",
    cell: (row) => (
      <div className="flex flex-col">
        <span className="text-body font-semibold text-ink">{row.collegeName ?? "—"}</span>
        <span className="text-caption text-ink-subtle">{row.courseName ?? "—"}</span>
      </div>
    ),
  },
  {
    id: "basis",
    header: "Commercial basis",
    // The contract stores both bases and a computed total. Showing which one is
    // in force, and the arithmetic behind it, is what makes an invoice
    // checkable without opening the record.
    cell: (row) =>
      row.commercialBasis === "PER_STUDENT" ? (
        <div className="flex flex-col">
          <span className="text-body-sm">Per student</span>
          <span className="font-mono text-caption text-ink-subtle tabular-nums">
            {money(row.perStudentRateMinor)} × {formatCount(row.billableHeadcount)}
          </span>
        </div>
      ) : (
        <div className="flex flex-col">
          <span className="text-body-sm">Flat cohort</span>
          <span className="font-mono text-caption text-ink-subtle tabular-nums">
            {money(row.flatCohortPriceMinor)}
          </span>
        </div>
      ),
  },
  {
    id: "headcount",
    header: "Headcount",
    align: "end",
    cell: (row) => (
      <div className="flex flex-col items-end">
        <span className="tabular-nums">{formatCount(row.billableHeadcount)}</span>
        <span className="text-caption text-ink-subtle">
          {row.headcountBasis.toLowerCase()}
          {row.enrolledHeadcount === undefined
            ? ""
            : ` · ${formatCount(row.enrolledHeadcount)} enrolled`}
        </span>
      </div>
    ),
  },
  {
    id: "total",
    header: "Contract value",
    align: "end",
    cell: (row) => (
      <div className="flex flex-col items-end">
        <span className="font-mono font-semibold tabular-nums">{money(row.totalValueMinor)}</span>
        {row.overrideTotalMinor === null ? null : (
          <span
            className="text-caption text-warning-strong"
            title={row.overrideReason ?? "Overridden"}
          >
            overridden
          </span>
        )}
      </div>
    ),
  },
  {
    id: "paid",
    header: "Collected",
    align: "end",
    cell: (row) => (
      <span className="font-mono text-success-strong tabular-nums">
        {money(row.totalPaidMinor)}
      </span>
    ),
  },
  {
    id: "balance",
    header: "Outstanding",
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
    id: "status",
    header: "Status",
    cell: (row) => {
      const status = STATUS[row.status];
      return <StatusPill intent={status.intent}>{status.label}</StatusPill>;
    },
  },
];

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("feeLedger");
  const params = await searchParams;
  const page = await listContracts(params);

  return (
    <ListPage
      eyebrow="Fee ledger"
      title="Institutional contracts"
      description="The college is billed, not its students. One installment engine, two parents — a scheduled payment hangs off either a student ledger or a college contract, never both."
      toolbar={
        <ListFilters
          params={params}
          searchPlaceholder="Search contracts, colleges or codes…"
          selects={[
            {
              name: "status",
              label: "Status",
              options: [
                { value: "", label: "All statuses" },
                { value: "DRAFT", label: "Draft" },
                { value: "ACTIVE", label: "Active" },
                { value: "PAID", label: "Paid in full" },
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
          hrefForPage={(n) => withParam("/fee-ledger/contracts", params, "page", String(n))}
          summary={pageSummary(page.page, page.pageSize, page.total)}
        />
      }
    >
      <DataTable
        columns={COLUMNS}
        rows={page.rows}
        getRowId={(row) => row.contractId}
        caption="College contracts by commercial basis, value and collection"
        minWidth="1500px"
        empty={
          <EmptyState
            title="No contracts match those filters"
            description="A contract is created when a college engagement is commercially agreed."
          />
        }
      />
    </ListPage>
  );
}
