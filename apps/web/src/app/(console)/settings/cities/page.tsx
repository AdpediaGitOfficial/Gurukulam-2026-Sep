import type { Metadata } from "next";
import type { City } from "@gurukulam/contracts";

import { ListFilters } from "@/components/patterns/list-filters";
import { ListPage } from "@/components/patterns/list-page";
import { Column, DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { StatusPill } from "@/components/ui/status-pill";
import { listCities } from "@/features/localisation/server/localisation-service";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";
import { pageSummary, withParam } from "@/lib/href";
import { formatCount } from "@/lib/format";

export const metadata: Metadata = { title: "Cities" };

const COLUMNS: Column<City>[] = [
  {
    id: "city",
    header: "City",
    cell: (row) => (
      <div className="flex flex-col">
        <span className="text-body font-semibold text-ink">{row.name}</span>
        <span className="font-mono text-caption text-ink-subtle">{row.cityCode}</span>
      </div>
    ),
  },
  {
    id: "state",
    header: "State / province",
    cell: (row) => row.state ?? <span className="text-ink-subtle">—</span>,
  },
  { id: "country", header: "Country", cell: (row) => row.countryName ?? <span className="text-ink-subtle">—</span> },
  {
    id: "timezone",
    header: "Timezone",
    cell: (row) =>
      row.timezone === null ? (
        <span className="text-ink-subtle">Country default</span>
      ) : (
        <span className="font-mono text-body-sm text-ink-muted">{row.timezone}</span>
      ),
  },
  {
    id: "colleges",
    header: "Colleges",
    align: "end",
    cell: (row) => <span className="tabular-nums">{formatCount(row.collegeCount ?? 0)}</span>,
  },
  {
    id: "students",
    header: "Students",
    align: "end",
    cell: (row) => <span className="tabular-nums">{formatCount(row.studentCount ?? 0)}</span>,
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

export default async function CitiesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("settings");
  const params = await searchParams;
  const page = await listCities(params);

  return (
    <ListPage
      eyebrow="Settings"
      title="Cities"
      description="Operating cities mapped to their parent country. A city is not just a label — it is what scopes a regional sub-admin's access."
      toolbar={
        <ListFilters
          params={params}
          searchPlaceholder="Search cities…"
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
          hrefForPage={(n) => withParam("/settings/cities", params, "page", String(n))}
          summary={pageSummary(page.page, page.pageSize, page.total)}
        />
      }
    >
      <DataTable
        columns={COLUMNS}
        rows={page.rows}
        getRowId={(row) => row.cityId}
        caption="Operating cities with their parent country and footprint"
        minWidth="1050px"
        empty={<EmptyState title="No cities match those filters" />}
      />
    </ListPage>
  );
}
