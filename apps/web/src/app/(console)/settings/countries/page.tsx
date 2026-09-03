import type { Metadata } from "next";
import type { Country } from "@gurukulam/contracts";

import { ListFilters } from "@/components/patterns/list-filters";
import { ListPage } from "@/components/patterns/list-page";
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

const COLUMNS: Column<Country>[] = [
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
];

export default async function CountriesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("settings");
  const params = await searchParams;
  const page = await listCountries(params);

  return (
    <ListPage
      eyebrow="Settings"
      title="Countries"
      description="Operating countries, their currencies, dial codes and default timezones. Set up once, then referenced everywhere."
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
        columns={COLUMNS}
        rows={page.rows}
        getRowId={(row) => row.countryId}
        caption="Operating countries with their ISO codes, currencies and timezones"
        minWidth="1000px"
        empty={<EmptyState title="No countries match those filters" />}
      />
    </ListPage>
  );
}
