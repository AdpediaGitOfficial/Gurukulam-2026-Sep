import type { Metadata } from "next";
import type { Certificate } from "@gurukulam/contracts";

import { ListFilters } from "@/components/patterns/list-filters";
import { ListPage } from "@/components/patterns/list-page";
import { SegmentTag } from "@/components/patterns/segment-tag";
import { Column, DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { StatusPill } from "@/components/ui/status-pill";
import { listCertificates } from "@/features/certificates/server/certificates-service";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";
import { pageSummary, withParam } from "@/lib/href";

export const metadata: Metadata = { title: "Certificates" };

const STATUS: Record<string, { intent: "success" | "warning" | "danger" | "neutral"; label: string }> = {
  ISSUED: { intent: "success", label: "Issued" },
  PENDING: { intent: "warning", label: "Pending" },
  REVOKED: { intent: "danger", label: "Revoked" },
};

const COLUMNS: Column<Certificate>[] = [
  {
    id: "number",
    header: "Certificate number",
    // Never reused, deleted or not — receipts, reports and the public verifier
    // all point at it.
    cell: (row) => (
      <div className="flex flex-col">
        <span className="font-mono text-body-sm text-ink">{row.certificateNumber}</span>
        <span className="font-mono text-caption text-ink-subtle">
          verify: {row.verificationCode}
        </span>
      </div>
    ),
  },
  {
    id: "student",
    header: "Student",
    cell: (row) => (
      <div className="flex flex-col">
        <span className="text-body font-semibold text-ink">{row.studentName ?? "—"}</span>
        {row.studentCode === null || row.studentCode === undefined ? null : (
          <span className="font-mono text-caption text-ink-subtle">{row.studentCode}</span>
        )}
      </div>
    ),
  },
  {
    id: "course",
    header: "Course",
    cell: (row) => (
      <div className="flex flex-col">
        <span className="text-body-sm">{row.courseName ?? "—"}</span>
        {row.batchCode === null || row.batchCode === undefined ? null : (
          <span className="font-mono text-caption text-ink-subtle">{row.batchCode}</span>
        )}
      </div>
    ),
  },
  {
    id: "segment",
    header: "Who downloads it",
    // Retail students download their own; for a college student the institution
    // does. That is the whole difference between the two segments here.
    cell: (row) =>
      row.segment === undefined ? (
        <span className="text-ink-subtle">—</span>
      ) : (
        <div className="flex flex-col gap-1">
          <SegmentTag segment={row.segment} />
          <span className="text-caption text-ink-subtle">
            {row.segment === "RETAIL" ? "The student" : "The college"}
          </span>
        </div>
      ),
  },
  {
    id: "issued",
    header: "Issued",
    cell: (row) =>
      row.issuedDate === null ? (
        <span className="text-ink-subtle">—</span>
      ) : (
        <span className="text-body-sm text-ink-muted">
          {new Date(row.issuedDate).toLocaleDateString("en-IN")}
        </span>
      ),
  },
  {
    id: "status",
    header: "Status",
    cell: (row) => {
      const status = STATUS[row.status] ?? { intent: "neutral" as const, label: row.status };
      return (
        <div className="flex flex-col gap-1">
          <StatusPill intent={status.intent}>{status.label}</StatusPill>
          {row.revokedReason === null ? null : (
            <span className="text-caption text-ink-subtle">{row.revokedReason}</span>
          )}
        </div>
      );
    },
  },
];

export default async function CertificatesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("certificates");
  const params = await searchParams;
  const page = await listCertificates(params);

  return (
    <ListPage
      eyebrow="Students"
      title="Certificates"
      description="Issued on course completion in both segments. A retail student downloads their own; a college downloads its students’."
      toolbar={
        <ListFilters
          params={params}
          searchPlaceholder="Search by student, number or course…"
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
              name: "status",
              label: "Status",
              options: [
                { value: "", label: "All statuses" },
                { value: "PENDING", label: "Pending" },
                { value: "ISSUED", label: "Issued" },
                { value: "REVOKED", label: "Revoked" },
              ],
            },
          ]}
        />
      }
      pagination={
        <Pagination
          page={page.page}
          pageCount={page.totalPages}
          hrefForPage={(n) => withParam("/students/certificates", params, "page", String(n))}
          summary={pageSummary(page.page, page.pageSize, page.total)}
        />
      }
    >
      <DataTable
        columns={COLUMNS}
        rows={page.rows}
        getRowId={(row) => row.certificateId}
        caption="Certificates by student, course and segment"
        minWidth="1250px"
        empty={
          <EmptyState
            title="No certificates match those filters"
            description="Certificates appear once a batch completes and its names are approved."
          />
        }
      />
    </ListPage>
  );
}
