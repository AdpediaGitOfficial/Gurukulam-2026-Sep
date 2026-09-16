import type { Metadata } from "next";
import Link from "next/link";
import { formatRupees, fromWire, PARTNERSHIP_LABELS, type College } from "@gurukulam/contracts";

import { ListFilters } from "@/components/patterns/list-filters";
import { ListPage } from "@/components/patterns/list-page";
import { StatTile, StatTileGrid } from "@/components/patterns/stat-tile";
import { rowActions } from "@/components/patterns/row-actions";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Column, DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { StatusPill } from "@/components/ui/status-pill";
import { brandTokens, domainTokens } from "@/design-system/tokens";
import { getCollegeSummary, listColleges } from "@/features/colleges/server/colleges-service";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";
import { pageSummary, withParam } from "@/lib/href";
import { formatCount } from "@/lib/format";

export const metadata: Metadata = { title: "Colleges" };

const COLUMNS: Column<College>[] = [
  {
    id: "college",
    header: "College",
    cell: (row) => (
      <Link href={`/colleges/${row.collegeId}`} className="flex flex-col hover:underline">
        <span className="text-body font-semibold text-ink">{row.name}</span>
        <span className="font-mono text-caption text-ink-subtle">{row.collegeCode}</span>
      </Link>
    ),
  },
  {
    id: "city",
    header: "City",
    cell: (row) => row.cityName ?? <span className="text-ink-subtle">—</span>,
  },
  {
    id: "partnership",
    header: "Partnership",
    // What KIND of relationship this is — B2B under a contract, a sponsored
    // hub, or somewhere we place into rather than teach for. Specified in
    // admin-portal-plan.md M3 and carried on the record since.
    cell: (row) => (
      <div className="flex flex-col">
        <span className="text-body-sm text-ink">{PARTNERSHIP_LABELS[row.partnershipType]}</span>
        {row.disciplines.length === 0 ? null : (
          <span className="text-caption text-ink-subtle">
            {row.disciplines.slice(0, 2).join(", ")}
            {row.disciplines.length > 2 ? ` +${row.disciplines.length - 2}` : ""}
          </span>
        )}
      </div>
    ),
  },
  {
    id: "contacts",
    header: "Contacts",
    align: "end",
    cell: (row) => <span className="tabular-nums">{formatCount(row.pocCount ?? 0)}</span>,
  },
  {
    id: "students",
    header: "Students",
    align: "end",
    cell: (row) => <span className="tabular-nums">{formatCount(row.studentCount ?? 0)}</span>,
  },
  {
    id: "trainings",
    header: "Trainings",
    align: "end",
    cell: (row) => <span className="tabular-nums">{formatCount(row.batchCount ?? 0)}</span>,
  },
  {
    id: "requirements",
    header: "Open reqs",
    align: "end",
    cell: (row) => <span className="tabular-nums">{formatCount(row.openRequirementCount ?? 0)}</span>,
  },
  {
    id: "portal",
    header: "Portal",
    // Null and NONE are different answers: null is "nobody there was ever
    // given an account", NONE is "an account exists and is not granted".
    cell: (row) => {
      const status = row.portalAccessStatus;
      if (status === null || status === undefined) {
        return <span className="text-caption text-ink-subtle">No account</span>;
      }
      const intent =
        status === "GRANTED" ? "success" : status === "INVITED" ? "info" : status === "REVOKED" ? "danger" : "neutral";
      const label =
        status === "GRANTED" ? "Portal access" : status === "INVITED" ? "Invited" : status === "REVOKED" ? "Revoked" : "Not granted";
      return <StatusPill intent={intent}>{label}</StatusPill>;
    },
  },
  {
    id: "status",
    header: "Status",
    cell: (row) => (
      <StatusPill intent={row.isActive ? "success" : "neutral"}>
        {row.isActive ? "Active" : "Inactive"}
      </StatusPill>
    ),
  },
  rowActions((row) => [{ label: "Edit", href: `/colleges/${row.collegeId}/edit` }]),
];

export default async function CollegesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("colleges");
  const params = await searchParams;
  const [page, summary] = await Promise.all([listColleges(params), getCollegeSummary()]);

  return (
    <ListPage
      eyebrow="Colleges"
      title="College database"
      description="The CRM for institutional relationships. A college is an actor, not a directory row — it carries its own contacts, requirements, students and contracts."
      action={
        <Link href="/colleges/new" className={buttonVariants({ variant: "primary" })}>
          Add college
        </Link>
      }
      summary={
        <>
          {/* Scoped as the list is, and not narrowed by the toolbar — these
              are the denominator the filtered table is read against. */}
          <StatTileGrid>
            <StatTile
              label="Colleges on record"
              value={formatCount(summary.colleges)}
              caption={
                summary.pendingActivation === 0
                  ? "All trading"
                  : `${formatCount(summary.pendingActivation)} pending activation`
              }
              icon="college"
              color={domainTokens.colleges}
            />
            <StatTile
              label="College students"
              value={formatCount(summary.students)}
              caption={`Across ${formatCount(summary.liveBatches)} live batch${summary.liveBatches === 1 ? "" : "es"}`}
              icon="users"
              color={domainTokens.students}
              href="/students?segment=COLLEGE"
            />
            <StatTile
              label="Open requirements"
              value={formatCount(summary.openRequirements)}
              caption={
                summary.awaitingConfirmation === 0
                  ? "None awaiting us"
                  : `${formatCount(summary.awaitingConfirmation)} awaiting confirmation`
              }
              icon="brief"
              color={brandTokens.brand}
              href="/colleges/requirements"
            />
            <StatTile
              label="Contract value"
              value={formatRupees(fromWire(summary.contractValueMinor), { paise: false })}
              caption={`${formatRupees(fromWire(summary.contractOutstandingMinor), { paise: false })} outstanding`}
              icon="rupee"
              color={brandTokens.gold}
              href="/fee-ledger/contracts"
            />
          </StatTileGrid>
          {params["created"] === "1" ? (
            <Alert intent="success" title="Added">
              College added.
            </Alert>
          ) : null}
        </>
      }
      toolbar={
        <ListFilters
          params={params}
          searchPlaceholder="Search colleges, codes or contacts…"
          selects={[
            {
              name: "isActive",
              label: "Status",
              options: [
                { value: "", label: "All statuses" },
                { value: "true", label: "Active" },
                { value: "false", label: "Inactive" },
              ],
            },
          ]}
        />
      }
      pagination={
        <Pagination
          page={page.page}
          pageCount={page.totalPages}
          hrefForPage={(n) => withParam("/colleges", params, "page", String(n))}
          summary={pageSummary(page.page, page.pageSize, page.total)}
        />
      }
    >
      <DataTable
        columns={COLUMNS}
        rows={page.rows}
        getRowId={(row) => row.collegeId}
        caption="Colleges by city, disciplines and engagement"
        minWidth="1200px"
        empty={
          <EmptyState
            title="No colleges match those filters"
            description="Try a broader search term, or clear the status filter."
          />
        }
      />
    </ListPage>
  );
}
