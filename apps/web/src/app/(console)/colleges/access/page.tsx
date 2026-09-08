import type { Metadata } from "next";
import Link from "next/link";
import type { CollegeUser } from "@gurukulam/contracts";

import { ListFilters } from "@/components/patterns/list-filters";
import { ListPage } from "@/components/patterns/list-page";
import { Alert } from "@/components/ui/alert";
import { Column, DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { StatusPill } from "@/components/ui/status-pill";
import { listAllPortalAccess, listColleges } from "@/features/colleges/server/colleges-service";
import { listCities } from "@/features/localisation/server/localisation-service";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";
import { pageSummary, withParam } from "@/lib/href";

export const metadata: Metadata = { title: "Portal access" };

/**
 * Who can get in, across the estate.
 *
 * Granting and revoking stay on the college's own access page — they are acts
 * against one institution, and both need its contacts to hand. This view is
 * the read: the account nobody ever signed into, the revocation that is still
 * in force, the college with no login at all.
 */
const COLUMNS: Column<CollegeUser>[] = [
  {
    id: "person",
    header: "Account",
    cell: (row) => (
      <span className="flex flex-col">
        <span className="text-body font-semibold text-ink">{row.name}</span>
        {/* Two addresses, deliberately different: the login identity is derived
            from the college code, their own address is where invoices go. */}
        <span className="text-caption text-ink-subtle">{row.email}</span>
      </span>
    ),
  },
  {
    id: "college",
    header: "College",
    cell: (row) => (
      <Link
        href={`/colleges/${row.collegeId}/access`}
        className="flex flex-col hover:underline"
      >
        <span className="text-body text-ink">{row.collegeName ?? "—"}</span>
        <span className="font-mono text-caption text-ink-subtle">{row.collegeCode ?? "—"}</span>
      </Link>
    ),
  },
  { id: "city", header: "City", cell: (row) => row.cityName ?? <span className="text-ink-subtle">—</span> },
  {
    id: "login",
    header: "Signs in as",
    cell: (row) =>
      row.loginEmail === null ? (
        <span className="text-ink-subtle">—</span>
      ) : (
        <span className="font-mono text-body-sm text-ink-muted">{row.loginEmail}</span>
      ),
  },
  {
    id: "status",
    header: "Access",
    cell: (row) => (
      <div className="flex flex-col gap-1">
        <StatusPill
          intent={
            row.accessStatus === "GRANTED"
              ? "success"
              : row.accessStatus === "REVOKED"
                ? "danger"
                : "neutral"
          }
        >
          {row.accessStatus.toLowerCase()}
        </StatusPill>
        {/* Why, beside the account it applies to — the whole point of storing
            the reason rather than asking around later. */}
        {row.revokeReason === null ? null : (
          <span className="text-caption text-ink-subtle">&ldquo;{row.revokeReason}&rdquo;</span>
        )}
      </div>
    ),
  },
  {
    id: "seen",
    header: "Last seen",
    cell: (row) =>
      row.accessStatus === "REVOKED" && row.revokedAt !== null ? (
        <span className="text-body-sm text-ink-muted">revoked {row.revokedAt.slice(0, 10)}</span>
      ) : row.lastLoginAt === null ? (
        <span className="text-ink-subtle">never signed in</span>
      ) : (
        <span className="text-body-sm text-ink-muted">{row.lastLoginAt.slice(0, 10)}</span>
      ),
  },
  {
    id: "manage",
    header: "",
    align: "end",
    cell: (row) => (
      <Link
        href={`/colleges/${row.collegeId}/access`}
        className="text-body-sm text-gold underline-offset-4 hover:underline"
      >
        Manage
      </Link>
    ),
  },
];

export default async function PortalAccessPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("colleges");
  const params = await searchParams;

  const [page, colleges, cities] = await Promise.all([
    listAllPortalAccess(params),
    listColleges({ pageSize: "200", isActive: "true" }),
    listCities({ pageSize: "200", isActive: "true" }),
  ]);

  return (
    <ListPage
      eyebrow="Colleges"
      title="Portal access"
      description="Every college login on file. Access is granted per person on the college's own record, never to an institution as a whole."
      summary={
        /* Said plainly rather than discovered: the credentials are real and the
           API honours them, but there is nowhere yet for them to be used. */
        <Alert intent="warning" title="The college portal is not live yet">
          These accounts work against the API and the scope behind them is enforced, but the portal
          itself is not built — there is no page for a college user to sign in to.
        </Alert>
      }
      toolbar={
        <ListFilters
          params={params}
          searchPlaceholder="Search name or login…"
          selects={[
            {
              name: "collegeId",
              label: "College",
              options: [
                { value: "", label: "All colleges" },
                ...colleges.rows.map((college) => ({
                  value: college.collegeId,
                  label: college.name,
                })),
              ],
            },
            {
              name: "cityId",
              label: "City",
              options: [
                { value: "", label: "All cities" },
                ...cities.rows.map((city) => ({ value: city.cityId, label: city.name })),
              ],
            },
            {
              name: "accessStatus",
              label: "Access",
              options: [
                { value: "", label: "Any status" },
                { value: "GRANTED", label: "Granted" },
                { value: "INVITED", label: "Invited" },
                { value: "REVOKED", label: "Revoked" },
                { value: "NONE", label: "None" },
              ],
            },
          ]}
        />
      }
      pagination={
        <Pagination
          page={page.page}
          pageCount={page.totalPages}
          hrefForPage={(n) => withParam("/colleges/access", params, "page", String(n))}
          summary={pageSummary(page.page, page.pageSize, page.total)}
        />
      }
    >
      <DataTable
        columns={COLUMNS}
        rows={page.rows}
        getRowId={(row) => row.collegeUserId}
        caption="College portal accounts across every institution"
        minWidth="1250px"
        empty={
          <EmptyState
            title="No portal accounts match those filters"
            description="Access is granted from a college's own record, against one of its contacts."
          />
        }
      />
    </ListPage>
  );
}
