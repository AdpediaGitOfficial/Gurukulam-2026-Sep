import type { Metadata } from "next";
import Link from "next/link";
import type { CollegeContact } from "@gurukulam/contracts";

import { ListFilters } from "@/components/patterns/list-filters";
import { ListPage } from "@/components/patterns/list-page";
import { Column, DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { StatusPill } from "@/components/ui/status-pill";
import { listColleges, listContacts } from "@/features/colleges/server/colleges-service";
import { listCities } from "@/features/localisation/server/localisation-service";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";
import { pageSummary, withParam } from "@/lib/href";

export const metadata: Metadata = { title: "College contacts" };

/**
 * The same rows a college record already shows, read from the other side.
 *
 * A college's own page answers "who do we deal with here". This page answers
 * the question an operator actually starts from — a name, an email, a call
 * that came in — and gets them to the institution. It also makes the gap
 * visible: a contact we correspond with who cannot sign in.
 */
const COLUMNS: Column<CollegeContact>[] = [
  {
    id: "contact",
    header: "Contact",
    cell: (row) => (
      <span className="flex flex-col">
        <span className="text-body font-semibold text-ink">{row.name}</span>
        <span className="text-caption text-ink-subtle">
          {row.designation ?? "—"}
          {row.department === null ? "" : ` · ${row.department}`}
        </span>
      </span>
    ),
  },
  {
    id: "college",
    header: "College",
    cell: (row) => (
      <Link href={`/colleges/${row.collegeId}`} className="flex flex-col hover:underline">
        <span className="text-body text-ink">{row.collegeName ?? "—"}</span>
        <span className="font-mono text-caption text-ink-subtle">{row.collegeCode ?? "—"}</span>
      </Link>
    ),
  },
  { id: "city", header: "City", cell: (row) => row.cityName ?? <span className="text-ink-subtle">—</span> },
  {
    id: "reach",
    header: "How to reach them",
    cell: (row) => (
      <span className="flex flex-col">
        <span className="text-body-sm text-ink">{row.email}</span>
        <span className="font-mono text-caption text-ink-subtle">{row.phone ?? "—"}</span>
      </span>
    ),
  },
  {
    id: "primary",
    header: "Primary",
    // Exactly one contact per college is primary; across colleges the column
    // reads as "is this the person we go to at that institution".
    cell: (row) =>
      row.isPrimary ? (
        <StatusPill intent="info">primary</StatusPill>
      ) : (
        <span className="text-ink-subtle">—</span>
      ),
  },
  {
    id: "access",
    header: "Portal access",
    cell: (row) =>
      row.portalAccessStatus === null ? (
        <span className="text-ink-subtle">no account</span>
      ) : (
        <StatusPill
          intent={
            row.portalAccessStatus === "GRANTED"
              ? "success"
              : row.portalAccessStatus === "REVOKED"
                ? "danger"
                : "neutral"
          }
        >
          {row.portalAccessStatus.toLowerCase()}
        </StatusPill>
      ),
  },
  {
    id: "edit",
    header: "",
    align: "end",
    // Contacts are edited on their college, because they are replaced as a set
    // — one primary, and the whole list saved together.
    cell: (row) => (
      <Link
        href={`/colleges/${row.collegeId}/contacts`}
        className="text-body-sm text-gold underline-offset-4 hover:underline"
      >
        Edit
      </Link>
    ),
  },
];

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("colleges");
  const params = await searchParams;

  const [page, colleges, cities] = await Promise.all([
    listContacts(params),
    listColleges({ pageSize: "200", isActive: "true" }),
    listCities({ pageSize: "200", isActive: "true" }),
  ]);

  return (
    <ListPage
      eyebrow="Colleges"
      title="Contacts"
      description="Everyone we deal with at an institution, across all of them. A contact belongs to one college and is edited there."
      toolbar={
        <ListFilters
          params={params}
          searchPlaceholder="Search name, email or college…"
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
              name: "isPrimary",
              label: "Primary",
              options: [
                { value: "", label: "Everyone" },
                { value: "true", label: "Primary only" },
              ],
            },
          ]}
        />
      }
      pagination={
        <Pagination
          page={page.page}
          pageCount={page.totalPages}
          hrefForPage={(n) => withParam("/colleges/contacts", params, "page", String(n))}
          summary={pageSummary(page.page, page.pageSize, page.total)}
        />
      }
    >
      <DataTable
        columns={COLUMNS}
        rows={page.rows}
        getRowId={(row) => row.pocId}
        caption="Points of contact across every college"
        minWidth="1200px"
        empty={
          <EmptyState
            title="No contacts match those filters"
            description="Contacts are added on a college record — a contact cannot exist without one."
          />
        }
      />
    </ListPage>
  );
}
