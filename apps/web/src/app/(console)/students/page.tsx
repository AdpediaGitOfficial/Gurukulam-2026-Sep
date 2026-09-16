import type { Metadata } from "next";
import Link from "next/link";
import type { Student } from "@gurukulam/contracts";

import { ListFilters } from "@/components/patterns/list-filters";
import { ListPage } from "@/components/patterns/list-page";
import { StatTile, StatTileGrid } from "@/components/patterns/stat-tile";
import { rowActions } from "@/components/patterns/row-actions";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Column, DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatusPill } from "@/components/ui/status-pill";
import { formatCount } from "@/lib/format";
import { SegmentTag } from "@/components/patterns/segment-tag";
import { brandTokens, domainTokens, feedbackTokens } from "@/design-system/tokens";
import { getStudentSummary, listStudents } from "@/features/students/server/students-service";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";
import { pageSummary, withParam , exportHref } from "@/lib/href";

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
      <Link href={`/students/${row.studentId}`} className="flex flex-col hover:underline">
        <span className="text-body font-semibold text-ink">{fullName(row)}</span>
        <span className="text-caption text-ink-subtle">{row.email}</span>
        <span className="font-mono text-caption text-ink-subtle">{row.studentCode}</span>
      </Link>
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
    id: "batch",
    header: "Batch",
    // The roster they are on, not a count of rosters. A student sits on one
    // batch at a time; the count is what reports otherwise.
    cell: (row) =>
      row.batchCode === null || row.batchCode === undefined ? (
        <StatusPill intent="warning">Unallocated</StatusPill>
      ) : (
        <Link
          href={`/batches/${row.batchId}`}
          className="font-mono text-caption text-ink hover:underline"
        >
          {row.batchCode}
        </Link>
      ),
  },
  {
    id: "progress",
    header: "Progress",
    // Their batch's delivery, not their own attendance — nothing writes
    // attendance yet, and a bar that silently meant something else would be
    // read as personal. A batch with nothing scheduled reports no progress
    // rather than 0%, which would read as "behind".
    cell: (row) =>
      row.progressPct === null || row.progressPct === undefined ? (
        <span className="text-caption text-ink-subtle">Not started</span>
      ) : (
        <div className="flex items-center gap-2">
          {/* The label is required and carries the accessible name; the
              visible figure sits beside the bar, so it is hidden here rather
              than printed twice. */}
          <ProgressBar
            value={row.progressPct}
            label={`${row.batchCode ?? "Batch"} delivery`}
            hideLabel
            className="w-20"
          />
          <span className="text-caption text-ink-muted tabular-nums">{row.progressPct}%</span>
        </div>
      ),
  },
  {
    id: "createdBy",
    header: "Created by",
    // Every record carries its author, and a college-created student shows
    // the college user — that is what makes institutional intake auditable
    // rather than merely recorded.
    cell: (row) => (
      <div className="flex flex-col">
        <span className="text-body-sm text-ink">{row.createdByName ?? "—"}</span>
        {row.createdByType === "COLLEGE_USER" ? (
          <span className="text-caption text-ink-subtle">College user</span>
        ) : null}
      </div>
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
  rowActions((row) => [{ label: "Edit", href: `/students/${row.studentId}/edit` }]),
];

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("students");
  const params = await searchParams;
  const [page, summary] = await Promise.all([listStudents(params), getStudentSummary()]);

  return (
    <ListPage
      eyebrow="Students"
      title="Student directory"
      description="Retail and college students in one register. A retail student has no college — and never will."
      action={
        <div className="flex items-center gap-3">
          <a
            href={exportHref("/students", params)}
            className={buttonVariants({ variant: "secondary" })}
            // A plain anchor, not a Link: this returns a file, and
            // client-side navigation has nowhere to put one.
          >
            Export CSV
          </a>
          <Link href="/students/import" className={buttonVariants({ variant: "secondary" })}>
            Import
          </Link>
          <Link href="/students/new" className={buttonVariants({ variant: "primary" })}>
            Add student
          </Link>
        </div>
      }
      summary={
        <>
          {/* The denominator the filtered table is read against, so these are
              deliberately NOT narrowed by the toolbar — and they carry the same
              scope the list does, or a sub-admin would read the estate's totals
              over their own city's rows. */}
          <StatTileGrid>
            <StatTile
              label="Total students"
              value={formatCount(summary.total)}
              caption="Enrolled across all terms"
              icon="users"
              color={domainTokens.students}
            />
            <StatTile
              label="Retail"
              value={formatCount(summary.retail)}
              caption="Walk-in and inbound"
              icon="acct"
              color={brandTokens.gold}
              href="/students?segment=RETAIL"
            />
            <StatTile
              label="College"
              value={formatCount(summary.college)}
              caption={`Across ${formatCount(summary.collegesRepresented)} institution${
                summary.collegesRepresented === 1 ? "" : "s"
              }`}
              icon="college"
              color={domainTokens.colleges}
              href="/students?segment=COLLEGE"
            />
            <StatTile
              label="Unallocated"
              value={formatCount(summary.unallocated)}
              caption="Onboarded, no batch yet"
              icon="warn"
              color={summary.unallocated === 0 ? brandTokens.inkMuted : feedbackTokens.warning}
              href="/students/unallocated"
            />
          </StatTileGrid>
          {params["created"] === "1" ? (
            <Alert intent="success" title="Added">
              Student added.
            </Alert>
          ) : null}
        </>
      }
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
        minWidth="1200px"
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
