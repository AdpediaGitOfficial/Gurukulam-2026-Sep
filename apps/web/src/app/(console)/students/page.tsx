import type { Metadata } from "next";
import type { Student } from "@gurukulam/contracts";

import { ListFilters } from "@/components/patterns/list-filters";
import { ListPage } from "@/components/patterns/list-page";
import { Column, DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { StatusPill } from "@/components/ui/status-pill";
import { SegmentTag } from "@/components/patterns/segment-tag";
import { listStudents } from "@/features/students/server/students-service";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";
import { pageSummary, withParam } from "@/lib/href";

export const metadata: Metadata = { title: "Students" };

const STATUS = {
  ACTIVE: { intent: "success", label: "Active" },
  INACTIVE: { intent: "neutral", label: "Inactive" },
  SUSPENDED: { intent: "danger", label: "Suspended" },
} as const;

const fullName = (row: Student) =>
  row.lastName === null ? row.firstName : `${row.firstName} ${row.lastName}`;

const COLUMNS: Column<Student>[] = [
  {
    id: "student",
    header: "Student",
    cell: (row) => (
      <div className="flex flex-col">
        <span className="text-body font-semibold text-ink">{fullName(row)}</span>
        <span className="text-caption text-ink-subtle">{row.email}</span>
        <span className="font-mono text-caption text-ink-subtle">{row.studentCode}</span>
      </div>
    ),
  },
  {
    id: "segment",
    header: "Segment",
    cell: (row) => <SegmentTag segment={row.enrolmentChannel} />,
  },
  {
    id: "college",
    header: "College",
    // A retail student has no college and never will (invariant 1). The dash is
    // the correct value, not missing data.
    cell: (row) => row.collegeName ?? <span className="text-ink-subtle">—</span>,
  },
  {
    id: "city",
    header: "City",
    cell: (row) => row.cityName ?? <span className="text-ink-subtle">—</span>,
  },
  {
    id: "allocation",
    header: "Allocation",
    cell: (row) =>
      row.isAllocated === false ? (
        <StatusPill intent="warning">Unallocated</StatusPill>
      ) : (
        <span className="text-body-sm text-ink-muted tabular-nums">
          {row.batchCount ?? 0} {row.batchCount === 1 ? "batch" : "batches"}
        </span>
      ),
  },
  {
    id: "status",
    header: "Status",
    cell: (row) => {
      const status = STATUS[row.accountStatus];
      return <StatusPill intent={status.intent}>{status.label}</StatusPill>;
    },
  },
];

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("students");
  const params = await searchParams;
  const page = await listStudents(params);

  return (
    <ListPage
      eyebrow="Students"
      title="Student directory"
      description="Retail and college students in one register. A retail student has no college — and never will."
      toolbar={
        <ListFilters
          params={params}
          searchPlaceholder="Search by name, email or student code…"
          selects={[
            {
              name: "segment",
              label: "Segment",
              options: [
                { value: "", label: "All segments" },
                { value: "RETAIL", label: "Retail" },
                { value: "COLLEGE", label: "College" },
              ],
            },
            {
              name: "accountStatus",
              label: "Status",
              options: [
                { value: "", label: "All statuses" },
                { value: "ACTIVE", label: "Active" },
                { value: "INACTIVE", label: "Inactive" },
                { value: "SUSPENDED", label: "Suspended" },
              ],
            },
            {
              name: "allocated",
              label: "Allocation",
              options: [
                { value: "", label: "Allocated or not" },
                { value: "true", label: "In a batch" },
                { value: "false", label: "Unallocated" },
              ],
            },
          ]}
        />
      }
      pagination={
        <Pagination
          page={page.page}
          pageCount={page.totalPages}
          hrefForPage={(n) => withParam("/students", params, "page", String(n))}
          summary={pageSummary(page.page, page.pageSize, page.total)}
        />
      }
    >
      <DataTable
        columns={COLUMNS}
        rows={page.rows}
        getRowId={(row) => row.studentId}
        caption="Students by segment, college and allocation"
        minWidth="1100px"
        empty={
          <EmptyState
            title="No students match those filters"
            description="Try a broader search term, or clear a filter."
          />
        }
      />
    </ListPage>
  );
}
