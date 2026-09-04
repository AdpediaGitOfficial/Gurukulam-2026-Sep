import type { Metadata } from "next";
import Link from "next/link";
import { formatRupees, fromWire, type Trainer } from "@gurukulam/contracts";

import { ListFilters } from "@/components/patterns/list-filters";
import { ListPage } from "@/components/patterns/list-page";
import { rowActions } from "@/components/patterns/row-actions";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Column, DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { StatusPill } from "@/components/ui/status-pill";
import { listTrainers } from "@/features/trainers/server/trainers-service";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";
import { pageSummary, withParam } from "@/lib/href";
import { formatCount } from "@/lib/format";

export const metadata: Metadata = { title: "Trainers" };

const STATUS = {
  ACTIVE: { intent: "success", label: "Active" },
  INACTIVE: { intent: "neutral", label: "Inactive" },
  SUSPENDED: { intent: "danger", label: "Suspended" },
} as const;

/** "PER_HOUR" → "Per hour". The API's enum is not a label. */
const payModelLabel = (model: string): string =>
  model.charAt(0) + model.slice(1).toLowerCase().replace(/_/g, " ");

const COLUMNS: Column<Trainer>[] = [
  {
    id: "trainer",
    header: "Trainer",
    cell: (row) => (
      <div className="flex flex-col">
        <span className="text-body font-semibold text-ink">{row.name}</span>
        <span className="text-caption text-ink-subtle">{row.email}</span>
        <span className="font-mono text-caption text-ink-subtle">{row.trainerCode}</span>
      </div>
    ),
  },
  {
    id: "qualification",
    header: "Qualification",
    cell: (row) => (
      <span className="text-body-sm text-ink-muted">
        {row.qualification ?? <span className="text-ink-subtle">—</span>}
      </span>
    ),
  },
  {
    id: "skills",
    header: "Skills",
    cell: (row) =>
      row.skillTags.length === 0 ? (
        <span className="text-ink-subtle">—</span>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {row.skillTags.slice(0, 3).map((tag) => (
            <Chip key={tag}>{tag}</Chip>
          ))}
          {row.skillTags.length > 3 ? <Chip>+{row.skillTags.length - 3}</Chip> : null}
        </div>
      ),
  },
  {
    id: "courses",
    header: "Approved courses",
    align: "end",
    // This mapping is what filters the trainer picker when a batch is created:
    // a trainer can only take a batch of a course they are approved for.
    cell: (row) => (
      <span className="tabular-nums">{formatCount(row.approvedCourseCount ?? 0)}</span>
    ),
  },
  {
    id: "pay",
    header: "Pay",
    align: "end",
    cell: (row) =>
      row.payRateMinor === null ? (
        <span className="text-ink-subtle">—</span>
      ) : (
        <div className="flex flex-col items-end">
          <span className="font-mono tabular-nums">
            {formatRupees(fromWire(row.payRateMinor), { paise: false })}
          </span>
          {row.payModel === null ? null : (
            <span className="text-caption text-ink-subtle">{payModelLabel(row.payModel)}</span>
          )}
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
  rowActions((row) => [{ label: "Edit", href: `/trainers/${row.trainerId}/edit` }]),
];

export default async function TrainersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("trainers");
  const params = await searchParams;
  const page = await listTrainers(params);

  return (
    <ListPage
      eyebrow="Trainers"
      title="Instructor directory"
      description="Each trainer is approved for one or more courses. That mapping is what filters the trainer picker when a batch is created."
      action={
        <Link href="/trainers/new" className={buttonVariants({ variant: "primary" })}>
          Add trainer
        </Link>
      }
      summary={
        /* The approvals warning outranks the success line: the trainer exists
           either way, but one that is approved for nothing cannot be assigned
           to a batch, and that is the part an operator has to act on. */
        params["approvals"] === "failed" ? (
          <Alert intent="warning" title="Saved, but the course approvals did not">
            The trainer is on file. Their approved courses could not be written, so they cannot be
            assigned to a batch yet — open the trainer and set the approvals again.
          </Alert>
        ) : params["created"] === "1" ? (
          <Alert intent="success" title="Added">
            Trainer added.
          </Alert>
        ) : params["saved"] === "1" ? (
          <Alert intent="success" title="Saved">
            Trainer updated.
          </Alert>
        ) : null
      }
      toolbar={
        <ListFilters
          params={params}
          searchPlaceholder="Search trainers, codes or skills…"
          selects={[
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
          ]}
        />
      }
      pagination={
        <Pagination
          page={page.page}
          pageCount={page.totalPages}
          hrefForPage={(n) => withParam("/trainers", params, "page", String(n))}
          summary={pageSummary(page.page, page.pageSize, page.total)}
        />
      }
    >
      <DataTable
        columns={COLUMNS}
        rows={page.rows}
        getRowId={(row) => row.trainerId}
        caption="Trainers by qualification, skills and approved courses"
        minWidth="1350px"
        empty={
          <EmptyState
            title="No trainers match those filters"
            description="Try a broader search term, or clear the status filter."
          />
        }
      />
    </ListPage>
  );
}
