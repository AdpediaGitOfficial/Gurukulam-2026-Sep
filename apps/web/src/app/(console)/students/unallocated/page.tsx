import type { Metadata } from "next";
import type { Student, UnallocatedSummary } from "@gurukulam/contracts";

import { ListFilters } from "@/components/patterns/list-filters";
import { ListPage } from "@/components/patterns/list-page";
import { SegmentTag } from "@/components/patterns/segment-tag";
import { Column, DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import {
  getUnallocatedSummary,
  listUnallocated,
} from "@/features/students/server/students-service";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";
import { StatTile, StatTileGrid } from "@/components/patterns/stat-tile";
import { Card, CardHeader } from "@/components/ui/card";
import { brandTokens, feedbackTokens } from "@/design-system/tokens";
import { cn } from "@/lib/cn";
import { formatCount } from "@/lib/format";
import { pageSummary, withParam } from "@/lib/href";

export const metadata: Metadata = { title: "Unallocated students" };

const fullName = (row: Student) =>
  row.lastName === null ? row.firstName : `${row.firstName} ${row.lastName}`;

/** Days since the record was created — how long this one has been going cold. */
function waitingDays(createdAt: string): number {
  const created = new Date(createdAt).getTime();
  return Math.max(0, Math.floor((Date.now() - created) / 86_400_000));
}

/**
 * Colour by how long they have waited, not by an arbitrary threshold: under
 * three days is healthy, a week is a chase, beyond that it is at risk.
 */
function waitTone(days: number): string {
  if (days > 14) return "text-danger";
  if (days > 7) return "text-warning-strong";
  if (days > 3) return "text-gold";
  return "text-ink-subtle";
}

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
  { id: "segment", header: "Segment", cell: (row) => <SegmentTag segment={row.enrolmentChannel} /> },
  {
    id: "college",
    header: "College",
    cell: (row) => row.collegeName ?? <span className="text-ink-subtle">—</span>,
  },
  {
    id: "city",
    header: "City",
    cell: (row) => row.cityName ?? <span className="text-ink-subtle">—</span>,
  },
  {
    id: "waiting",
    header: "Waiting",
    align: "end",
    cell: (row) => {
      const days = waitingDays(row.createdAt);
      return (
        <span className={`font-semibold tabular-nums ${waitTone(days)}`}>
          {days} {days === 1 ? "day" : "days"}
        </span>
      );
    },
  },
  {
    id: "created",
    header: "Onboarded",
    cell: (row) => (
      <span className="text-body-sm text-ink-muted">
        {new Date(row.createdAt).toLocaleDateString("en-IN")}
      </span>
    ),
  },
];

export default async function UnallocatedStudentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("students");
  const params = await searchParams;
  const [summary, page] = await Promise.all([getUnallocatedSummary(), listUnallocated(params)]);

  return (
    <ListPage
      eyebrow="Students"
      title="Unallocated students"
      description="Onboarded, quoted, and generating nothing until they are in a batch. The longer one waits, the colder it gets."
      summary={<UnallocatedSummaryTiles summary={summary} />}
      toolbar={
        <ListFilters
          params={params}
          searchPlaceholder="Search unallocated students…"
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
          ]}
        />
      }
      pagination={
        <Pagination
          page={page.page}
          pageCount={page.totalPages}
          hrefForPage={(n) => withParam("/students/unallocated", params, "page", String(n))}
          summary={pageSummary(page.page, page.pageSize, page.total)}
        />
      }
    >
      <DataTable
        columns={COLUMNS}
        rows={page.rows}
        getRowId={(row) => row.studentId}
        caption="Students onboarded but not yet placed in a batch"
        minWidth="1050px"
        empty={
          <EmptyState
            title="Nobody is waiting"
            description="Every student on record is in a batch. This queue is meant to look like this."
          />
        }
      />
    </ListPage>
  );
}

/**
 * The ageing profile, and the three queues that are the same shape of problem:
 * a record that exists but is not doing its job.
 */
function UnallocatedSummaryTiles({ summary }: { summary: UnallocatedSummary }) {
  const { buckets } = summary.unallocated;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          as="h2"
          title="Ageing"
          description="Days since the record was created. Past a week, most of these have gone quiet."
        />
        <div className="mb-3 flex h-9 gap-0.5 overflow-hidden rounded-control">
          {[
            { label: "0–3 days", value: buckets.d0to3, className: "bg-success text-white" },
            { label: "4–7 days", value: buckets.d4to7, className: "bg-accent text-on-accent" },
            { label: "8–14 days", value: buckets.d8to14, className: "bg-warning text-white" },
            { label: "15+ days", value: buckets.d15plus, className: "bg-danger text-white" },
          ].map((bucket) => (
            <div
              key={bucket.label}
              // Flex-grown by count so the bar is the distribution, with a
              // floor so an empty bucket still shows it exists.
              style={{ flexGrow: Math.max(0.35, bucket.value) }}
              className={cn(
                "grid min-w-0 place-items-center text-caption font-bold tabular-nums",
                bucket.className,
              )}
            >
              {bucket.value}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-4 text-caption text-ink-muted">
          <Legend className="bg-success">0–3 days · healthy</Legend>
          <Legend className="bg-accent">4–7 days · chase</Legend>
          <Legend className="bg-warning">8–14 days · at risk</Legend>
          <Legend className="bg-danger">15+ days · likely lost</Legend>
        </div>
      </Card>

      <StatTileGrid>
        <StatTile
          label="Unallocated"
          value={formatCount(summary.unallocated.total)}
          caption="Onboarded, no batch yet"
          icon="users"
          color={summary.unallocated.total === 0 ? brandTokens.inkMuted : feedbackTokens.danger}
        />
        <StatTile
          label="Allocated, no ledger"
          value={formatCount(summary.noLedger)}
          caption="In a batch, billing never started"
          icon="rupee"
          color={summary.noLedger === 0 ? brandTokens.inkMuted : feedbackTokens.danger}
        />
        <StatTile
          label="Ledger, no schedule"
          value={formatCount(summary.noInstallments)}
          caption="Nothing will ever fall due"
          icon="cal"
          color={summary.noInstallments === 0 ? brandTokens.inkMuted : feedbackTokens.warning}
        />
        <StatTile
          label="Credentials unused"
          value={formatCount(summary.credentialsUnused)}
          caption="Issued a login, never signed in"
          icon="acct"
          color={brandTokens.inkMuted}
        />
      </StatTileGrid>
    </div>
  );
}

function Legend({ className, children }: { className: string; children: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className={cn("size-2.5 rounded-chip", className)} />
      {children}
    </span>
  );
}
