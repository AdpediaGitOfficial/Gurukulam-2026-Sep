import type { Metadata } from "next";
import Link from "next/link";
import { can, type Country } from "@gurukulam/contracts";

import { ListFilters } from "@/components/patterns/list-filters";
import { ListPage } from "@/components/patterns/list-page";
import { rowActions } from "@/components/patterns/row-actions";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Column, DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { StatusPill } from "@/components/ui/status-pill";
import { listCountries } from "@/features/localisation/server/localisation-service";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";
import { pageSummary, withParam } from "@/lib/href";
import { formatCount } from "@/lib/format";

export const metadata: Metadata = { title: "Countries" };

const columns = (mayDelete: boolean): Column<Country>[] => [
  {
    id: "country",
    header: "Country",
    cell: (row) => (
      <div className="flex flex-col">
        <span className="text-body font-semibold text-ink">{row.name}</span>
        <span className="font-mono text-caption text-ink-subtle">{row.countryCode}</span>
      </div>
    ),
  },
  {
    id: "iso",
    header: "ISO",
    // Monospace because these are read character by character and copied.
    cell: (row) => (
      <span className="font-mono text-body-sm">
        {row.iso2} · {row.iso3}
      </span>
    ),
  },
  { id: "dial", header: "Dial", cell: (row) => <span className="font-mono text-body-sm">{row.dialCode}</span> },
  { id: "currency", header: "Currency", cell: (row) => <span className="font-mono text-body-sm">{row.currency}</span> },
  {
    id: "timezone",
    header: "Timezone",
    cell: (row) => <span className="font-mono text-body-sm text-ink-muted">{row.timezone}</span>,
  },
  {
    id: "cities",
    header: "Cities",
    align: "end",
    cell: (row) => <span className="tabular-nums">{formatCount(row.cityCount ?? 0)}</span>,
  },
  {
    id: "status",
    header: "Status",
    cell: (row) => (
      <StatusPill intent={row.isActive ? "success" : "neutral"}>
        {row.isActive ? "Active" : "Archived"}
      </StatusPill>
    ),
  },
  rowActions(
    (row) => [{ label: "Edit", href: `/settings/countries/${row.countryId}/edit` }],
    mayDelete ? (row) => ({ target: "country" as const, id: row.countryId, label: row.name }) : undefined,
  ),
];

export default async function CountriesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const principal = await requireModule("settings");
  /* The Delete verb is not rendered at all for an operator without the
     permission — a button that answers 403 teaches people the console is
     broken rather than that they lack the right. */
  const mayDelete = can(principal, "settings", "delete");
  const params = await searchParams;
  const page = await listCountries(params);

  return (
    <ListPage
      eyebrow="Settings"
      title="Countries"
      description="Operating countries, their currencies, dial codes and default timezones. Set up once, then referenced everywhere."
      action={
        <Link href="/settings/countries/new" className={buttonVariants({ variant: "primary" })}>
          Add country
        </Link>
      }
      summary={
        params["created"] === "1" ? (
          <Alert intent="success" title="Added">
            Country added.
          </Alert>
        ) : params["saved"] === "1" ? (
          <Alert intent="success" title="Saved">
            Country updated.
          </Alert>
        ) : null
      }
      toolbar={
        <ListFilters
          params={params}
          searchPlaceholder="Search countries…"
          selects={[
            {
              name: "isActive",
              label: "Status",
              options: [
                { value: "", label: "All statuses" },
                { value: "true", label: "Active" },
                { value: "false", label: "Archived" },
              ],
            },
          ]}
        />
      }
      pagination={
        <Pagination
          page={page.page}
          pageCount={page.totalPages}
          hrefForPage={(n) => withParam("/settings/countries", params, "page", String(n))}
          summary={pageSummary(page.page, page.pageSize, page.total)}
        />
      }
    >
      <DataTable
        columns={columns(mayDelete)}
        rows={page.rows}
        getRowId={(row) => row.countryId}
        caption="Operating countries with their ISO codes, currencies and timezones"
        minWidth="1100px"
        empty={<EmptyState title="No countries match those filters" />}
      />
    </ListPage>
  );
}
