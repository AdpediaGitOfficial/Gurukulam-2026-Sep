import type { Metadata } from "next";
import type { AdminUser } from "@gurukulam/contracts";

import { ListFilters } from "@/components/patterns/list-filters";
import { ListPage } from "@/components/patterns/list-page";
import { Column, DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { StatusPill } from "@/components/ui/status-pill";
import { listAdministrators } from "@/features/settings/server/settings-service";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";
import { pageSummary, withParam } from "@/lib/href";

export const metadata: Metadata = { title: "Administrators" };

const STATUS = {
  ACTIVE: { intent: "success", label: "Active" },
  INACTIVE: { intent: "neutral", label: "Inactive" },
  SUSPENDED: { intent: "danger", label: "Suspended" },
} as const;

const COLUMNS: Column<AdminUser>[] = [
  {
    id: "admin",
    header: "Name",
    cell: (row) => (
      <div className="flex flex-col">
        <span className="text-body font-semibold text-ink">{row.name}</span>
        <span className="text-caption text-ink-subtle">{row.email}</span>
      </div>
    ),
  },
  {
    id: "role",
    header: "Role",
    cell: (row) => row.roleName ?? <span className="text-ink-subtle">—</span>,
  },
  {
    id: "scope",
    header: "Region scope",
    // An empty list is global. That is the opposite of "scoped to nothing", so
    // it gets words rather than an empty cell.
    cell: (row) =>
      row.cityScope.length === 0 ? (
        <span className="text-body-sm text-ink-muted">All regions</span>
      ) : (
        <span className="text-body-sm text-ink-muted">
          {(row.cityNames ?? row.cityScope).join(" · ")}
        </span>
      ),
  },
  {
    id: "lastLogin",
    header: "Last signed in",
    cell: (row) =>
      row.lastLoginAt === null ? (
        <span className="text-ink-subtle">Never</span>
      ) : (
        <span className="text-body-sm text-ink-muted">
          {new Date(row.lastLoginAt).toLocaleDateString("en-IN")}
        </span>
      ),
  },
  {
    id: "status",
    header: "Status",
    cell: (row) => {
      const status = STATUS[row.accountStatus];
      return (
        <div className="flex flex-col gap-1">
          <StatusPill intent={status.intent}>{status.label}</StatusPill>
          {row.mustResetPassword ? (
            <span className="text-caption text-warning-strong">Password reset pending</span>
          ) : null}
        </div>
      );
    },
  },
];

export default async function AdministratorsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("settings");
  const params = await searchParams;
  const page = await listAdministrators(params);

  return (
    <ListPage
      eyebrow="Settings"
      title="Administrators"
      description="Admin accounts and the regions each one is allowed to see."
      toolbar={<ListFilters params={params} searchPlaceholder="Search administrators…" />}
      pagination={
        <Pagination
          page={page.page}
          pageCount={page.totalPages}
          hrefForPage={(n) => withParam("/settings/administrators", params, "page", String(n))}
          summary={pageSummary(page.page, page.pageSize, page.total)}
        />
      }
    >
      <DataTable
        columns={COLUMNS}
        rows={page.rows}
        getRowId={(row) => row.adminUserId}
        caption="Administrators by role, region scope and status"
        minWidth="1000px"
        empty={<EmptyState title="No administrators match that search" />}
      />
    </ListPage>
  );
}
