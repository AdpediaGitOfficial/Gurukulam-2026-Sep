import type { Metadata } from "next";
import Link from "next/link";
import { formatRupees, fromWire, type LedgerSummary } from "@gurukulam/contracts";

import { ListFilters } from "@/components/patterns/list-filters";
import { ListPage } from "@/components/patterns/list-page";
import { Column, DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { StatusPill } from "@/components/ui/status-pill";
import { buttonVariants } from "@/components/ui/button";
import { listLedgers } from "@/features/ledger/server/ledger-service";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";
import { pageSummary, withParam } from "@/lib/href";

export const metadata: Metadata = { title: "Record a payment" };

const money = (minor: string) => formatRupees(fromWire(minor), { paise: false });

/** "Due 12 Oct", or the honest absence of a date. */
function due(row: LedgerSummary): string {
  if (row.nextDueDate === null) return "Nothing scheduled";
  return new Date(row.nextDueDate).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

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
        <span className="text-body">{row.courseName ?? "—"}</span>
        {row.batchCode === null ? null : (
          <span className="font-mono text-caption text-ink-subtle">{row.batchCode}</span>
        )}
      </div>
    ),
  },
  {
    id: "outstanding",
    header: "Outstanding",
    align: "end",
    cell: (row) => (
      <span className="text-body font-semibold tabular-nums text-ink">
        {money(row.balancePendingMinor)}
      </span>
    ),
  },
  {
    id: "next",
    header: "Next due",
    cell: (row) => (
      <div className="flex flex-col">
        <span className="text-body tabular-nums text-ink">{due(row)}</span>
        <span className="text-caption text-ink-subtle tabular-nums">
          {row.installmentsPaid} of {row.installmentsTotal} paid
        </span>
      </div>
    ),
  },
  {
    id: "overdue",
    header: "Status",
    cell: (row) =>
      row.overdueCount > 0 ? (
        <StatusPill intent="danger">
          {row.overdueCount} overdue
        </StatusPill>
      ) : (
        <StatusPill intent="neutral">On schedule</StatusPill>
      ),
  },
  {
    id: "act",
    header: "",
    align: "end",
    cell: (row) => (
      // The verb sits on the row, because the row is the thing being paid
      // against — which installment is decided on the ledger, where the
      // schedule is visible.
      <Link
        href={`/fee-ledger/${row.ledgerId}#record`}
        className={buttonVariants({ variant: "primary", size: "sm" })}
      >
        Record payment
      </Link>
    ),
  },
];

/**
 * "Somebody just walked in and paid" — the entry point for that.
 *
 * A payment is always posted against a SPECIFIC installment: the schedule is
 * hand-authored per student, and which row the money clears decides what the
 * receipt says and what falls due next. So this screen does the half a header
 * button can honestly do — find the person — and hands over to their ledger,
 * where the schedule is on screen beside the form.
 *
 * Retail only, by construction. A college student has no individual ledger
 * (invariant 3); their institution is billed under a contract, and that money
 * is recorded against the contract's own schedule.
 */
export default async function RecordPaymentPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("feeLedger", "edit");
  const params = await searchParams;

  /* Ledgers with nothing outstanding cannot receive money, so they are not
     offered. PAID_FULL is the one status this screen always excludes — the
     operator picks between the other three. */
  const status = typeof params["status"] === "string" ? params["status"] : undefined;
  const page = await listLedgers({
    ...params,
    ...(status === undefined || status === "PAID_FULL" ? { status: "" } : {}),
    /* Largest outstanding first. NOT by next due date, which reads better and
       is not a column — the API sorts on what the database can order, and an
       unrecognised sort key falls back silently to created-at, which would
       have made the caption below a lie. */
    sort: "balancePendingMinor",
    order: "desc",
  });
  const owing = page.rows.filter((row) => fromWire(row.balancePendingMinor) > 0n);

  return (
    <ListPage
      eyebrow="Fee ledger"
      title="Record a payment"
      description="Find who is paying — largest balance first, or filter to the overdue. Which installment the money clears is chosen on their ledger, beside the schedule it settles."
      breadcrumbs={[{ label: "Fee ledger", href: "/fee-ledger" }, { label: "Record a payment" }]}
      toolbar={
        <ListFilters
          params={params}
          searchPlaceholder="Search student, course or batch…"
          selects={[
            {
              name: "status",
              label: "Status",
              options: [
                { value: "", label: "Anything outstanding" },
                { value: "OVERDUE", label: "Overdue" },
                { value: "PARTIALLY_PAID", label: "Partially paid" },
                { value: "UNPAID", label: "Not started" },
              ],
            },
          ]}
        />
      }
    >
      <DataTable
        columns={COLUMNS}
        rows={owing}
        getRowId={(row) => row.ledgerId}
        caption="Retail ledgers with money still outstanding, largest balance first"
        minWidth="900px"
        empty={
          <EmptyState
            title="Nothing outstanding"
            description="Every retail ledger in view is paid in full. A college is billed under its contract, not here."
          />
        }
      />
    </ListPage>
  );
}
