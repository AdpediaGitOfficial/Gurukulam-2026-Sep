import type { Metadata } from "next";
import Link from "next/link";
import { formatRupees, fromWire, type Course } from "@gurukulam/contracts";

import { ListFilters } from "@/components/patterns/list-filters";
import { ListPage } from "@/components/patterns/list-page";
import { rowActions } from "@/components/patterns/row-actions";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Column, DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { StatusPill } from "@/components/ui/status-pill";
import { listCourses } from "@/features/courses/server/courses-service";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";
import { pageSummary, withParam } from "@/lib/href";
import { formatCount } from "@/lib/format";

export const metadata: Metadata = { title: "Courses" };

const COLUMNS: Column<Course>[] = [
  {
    id: "course",
    header: "Course",
    cell: (row) => (
      <div className="flex flex-col">
        <span className="text-body font-semibold text-ink">{row.name}</span>
        <span className="font-mono text-caption text-ink-subtle">{row.courseCode}</span>
      </div>
    ),
  },
  {
    id: "category",
    header: "Category",
    cell: (row) => row.category ?? <span className="text-ink-subtle">—</span>,
  },
  {
    id: "duration",
    header: "Duration",
    align: "end",
    cell: (row) =>
      row.durationWeeks === null ? (
        <span className="text-ink-subtle">—</span>
      ) : (
        <span className="tabular-nums">{row.durationWeeks} wks</span>
      ),
  },
  {
    id: "value",
    header: "Standard value",
    align: "end",
    cell: (row) => (
      <span className="font-mono tabular-nums">
        {formatRupees(fromWire(row.standardMarketValueMinor), { paise: false })}
      </span>
    ),
  },
  {
    id: "topics",
    header: "Topics",
    align: "end",
    cell: (row) => <span className="tabular-nums">{formatCount(row.topicCount ?? 0)}</span>,
  },
  {
    id: "batches",
    header: "Batches",
    align: "end",
    cell: (row) => <span className="tabular-nums">{formatCount(row.batchCount ?? 0)}</span>,
  },
  {
    id: "trainers",
    header: "Approved trainers",
    align: "end",
    cell: (row) => (
      <span className="tabular-nums">{formatCount(row.approvedTrainerCount ?? 0)}</span>
    ),
  },
  {
    id: "status",
    header: "Status",
    cell: (row) => (
      <StatusPill intent={row.isActive ? "success" : "neutral"}>
        {row.isActive ? "Published" : "Draft"}
      </StatusPill>
    ),
  },
  rowActions((row) => [{ label: "Edit", href: `/courses/${row.courseId}/edit` }]),
];

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("courses");
  const params = await searchParams;
  const page = await listCourses(params);

  return (
    <ListPage
      eyebrow="Courses"
      title="Course catalog"
      description="A course holds topics; each topic carries one or more sessions. Batches run the whole structure on a schedule."
      action={
        <Link href="/courses/new" className={buttonVariants({ variant: "primary" })}>
          Add course
        </Link>
      }
      summary={
        params["created"] === "1" ? (
          <Alert intent="success" title="Added">
            Course added.
          </Alert>
        ) : params["saved"] === "1" ? (
          <Alert intent="success" title="Saved">
            Course updated.
          </Alert>
        ) : null
      }
      toolbar={
        <ListFilters
          params={params}
          searchPlaceholder="Search courses or codes…"
          selects={[
            {
              name: "isActive",
              label: "Status",
              options: [
                { value: "", label: "All statuses" },
                { value: "true", label: "Published" },
                { value: "false", label: "Draft" },
              ],
            },
          ]}
        />
      }
      pagination={
        <Pagination
          page={page.page}
          pageCount={page.totalPages}
          hrefForPage={(n) => withParam("/courses", params, "page", String(n))}
          summary={pageSummary(page.page, page.pageSize, page.total)}
        />
      }
    >
      <DataTable
        columns={COLUMNS}
        rows={page.rows}
        getRowId={(row) => row.courseId}
        caption="Courses by category, duration and standard value"
        minWidth="1300px"
        empty={
          <EmptyState
            title="No courses match those filters"
            description="Try a broader search term, or clear the status filter."
          />
        }
      />
    </ListPage>
  );
}
