import type { Metadata } from "next";
import Link from "next/link";
import type { College } from "@gurukulam/contracts";

import { ListFilters } from "@/components/patterns/list-filters";
import { ListPage } from "@/components/patterns/list-page";
import { Chip } from "@/components/ui/chip";
import { Column, DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { StatusPill } from "@/components/ui/status-pill";
import { listColleges } from "@/features/colleges/server/colleges-service";
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
    id: "disciplines",
    header: "Disciplines",
    cell: (row) =>
      row.disciplines.length === 0 ? (
        <span className="text-ink-subtle">—</span>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {row.disciplines.slice(0, 3).map((d) => (
            <Chip key={d}>{d}</Chip>
          ))}
          {row.disciplines.length > 3 ? <Chip>+{row.disciplines.length - 3}</Chip> : null}
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
    id: "batches",
    header: "Batches",
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
    id: "status",
    header: "Status",
    cell: (row) => (
      <StatusPill intent={row.isActive ? "success" : "neutral"}>
        {row.isActive ? "Active" : "Inactive"}
      </StatusPill>
    ),
  },
];

export default async function CollegesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("colleges");
  const params = await searchParams;
  const page = await listColleges(params);

  return (
    <ListPage
      eyebrow="Colleges"
      title="College database"
      description="The CRM for institutional relationships. A college is an actor, not a directory row — it carries its own contacts, requirements, students and contracts."
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
        minWidth="1100px"
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
