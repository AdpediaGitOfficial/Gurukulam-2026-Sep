import type { Metadata } from "next";
import { formatRupees, fromWire, type JobPosting } from "@gurukulam/contracts";

import { ListFilters } from "@/components/patterns/list-filters";
import { ListPage } from "@/components/patterns/list-page";
import { Chip } from "@/components/ui/chip";
import { Column, DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { StatusPill } from "@/components/ui/status-pill";
import { listJobs } from "@/features/hiring/server/hiring-service";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";
import { pageSummary, withParam } from "@/lib/href";
import { formatCount } from "@/lib/format";

export const metadata: Metadata = { title: "Hiring" };

const STATUS = {
  DRAFT: { intent: "neutral", label: "Draft" },
  PUBLISHED: { intent: "success", label: "Published" },
  CLOSED: { intent: "neutral", label: "Closed" },
  ARCHIVED: { intent: "neutral", label: "Archived" },
} as const;

const WORK_MODE = { ONSITE: "On-site", REMOTE: "Remote", HYBRID: "Hybrid" } as const;

function compensation(row: JobPosting): string | null {
  if (row.compensationMinMinor === null && row.compensationMaxMinor === null) return null;
  const period = row.compensationPeriod === "MONTHLY" ? "/mo" : " p.a.";
  const low =
    row.compensationMinMinor === null
      ? null
      : formatRupees(fromWire(row.compensationMinMinor), { paise: false });
  const high =
    row.compensationMaxMinor === null
      ? null
      : formatRupees(fromWire(row.compensationMaxMinor), { paise: false });
  if (low !== null && high !== null) return `${low}–${high}${period}`;
  return `${low ?? high}${period}`;
}

function experience(row: JobPosting): string | null {
  const { experienceMinYears: min, experienceMaxYears: max } = row;
  if (min === null && max === null) return null;
  if (min !== null && max !== null) return `${min}–${max} yrs`;
  return min !== null ? `${min}+ yrs` : `up to ${max} yrs`;
}

const COLUMNS: Column<JobPosting>[] = [
  {
    id: "role",
    header: "Role",
    cell: (row) => (
      <div className="flex flex-col">
        <span className="text-body font-semibold text-ink">{row.roleTitle}</span>
        <span className="text-body-sm text-ink-muted">{row.companyName}</span>
        <span className="font-mono text-caption text-ink-subtle">{row.jobCode}</span>
      </div>
    ),
  },
  {
    id: "where",
    header: "Location",
    cell: (row) => (
      <span className="text-body-sm text-ink-muted">
        {[row.location, WORK_MODE[row.workMode]].filter(Boolean).join(" · ")}
      </span>
    ),
  },
  {
    id: "experience",
    header: "Experience",
    cell: (row) => experience(row) ?? <span className="text-ink-subtle">—</span>,
  },
  {
    id: "compensation",
    header: "Compensation",
    align: "end",
    cell: (row) => {
      const pay = compensation(row);
      return pay === null ? (
        <span className="text-ink-subtle">—</span>
      ) : (
        <span className="font-mono text-body-sm tabular-nums">{pay}</span>
      );
    },
  },
  {
    id: "audience",
    header: "Audience",
    // Course is the primary axis: a posting is aimed at the students who took
    // the relevant course, and everything else narrows it.
    cell: (row) => {
      const rules = row.audienceRules ?? [];
      if (rules.length === 0) return <span className="text-ink-subtle">Not targeted</span>;
      return (
        <div className="flex flex-wrap gap-1.5">
          {rules.slice(0, 2).map((rule) => (
            <Chip key={rule.ruleId}>{rule.courseName ?? "Course"}</Chip>
          ))}
          {rules.length > 2 ? <Chip>+{rules.length - 2}</Chip> : null}
        </div>
      );
    },
  },
  {
    id: "reach",
    header: "Reach",
    align: "end",
    cell: (row) =>
      row.reach === undefined ? (
        <span className="text-ink-subtle">—</span>
      ) : (
        <span className="tabular-nums">{formatCount(row.reach)}</span>
      ),
  },
  {
    id: "status",
    header: "Status",
    cell: (row) => {
      const status = STATUS[row.status];
      return <StatusPill intent={status.intent}>{status.label}</StatusPill>;
    },
  },
];

export default async function HiringPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("hiring");
  const params = await searchParams;
  const page = await listJobs(params);

  return (
    <ListPage
      eyebrow="Hiring"
      title="Job announcements"
      description="Post a role, aim it at the students who took the relevant course, and check the reach before publishing."
      toolbar={
        <ListFilters
          params={params}
          searchPlaceholder="Search roles or companies…"
          selects={[
            {
              name: "status",
              label: "Status",
              options: [
                { value: "", label: "All statuses" },
                { value: "DRAFT", label: "Draft" },
                { value: "PUBLISHED", label: "Published" },
                { value: "CLOSED", label: "Closed" },
                { value: "ARCHIVED", label: "Archived" },
              ],
            },
          ]}
        />
      }
      pagination={
        <Pagination
          page={page.page}
          pageCount={page.totalPages}
          hrefForPage={(n) => withParam("/hiring", params, "page", String(n))}
          summary={pageSummary(page.page, page.pageSize, page.total)}
        />
      }
    >
      <DataTable
        columns={COLUMNS}
        rows={page.rows}
        getRowId={(row) => row.jobPostingId}
        caption="Job postings by role, audience and reach"
        minWidth="1300px"
        empty={
          <EmptyState
            title="No postings match those filters"
            description="Try a broader search term, or clear the status filter."
          />
        }
      />
    </ListPage>
  );
}
