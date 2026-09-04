import type { Metadata } from "next";
import Link from "next/link";
import type { Student } from "@gurukulam/contracts";

import { PageBody, PageSection } from "@/components/patterns/page-section";
import { SegmentTag } from "@/components/patterns/segment-tag";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Column, DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { StatusPill } from "@/components/ui/status-pill";
import { BatchHeader } from "@/features/batches/components/batch-header";
import { getBatch, listSessions } from "@/features/batches/server/batches-service";
import { listStudents } from "@/features/students/server/students-service";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";
import { pageSummary, withParam } from "@/lib/href";
import { formatCount } from "@/lib/format";

export const metadata: Metadata = { title: "Batch roster" };

const fullName = (s: Student) =>
  s.lastName === null ? s.firstName : `${s.firstName} ${s.lastName}`;

const COLUMNS: Column<Student>[] = [
  {
    id: "student",
    header: "Student",
    cell: (row) => (
      <Link href={`/students/${row.studentId}`} className="flex flex-col hover:underline">
        <span className="text-body font-semibold text-ink">{fullName(row)}</span>
        <span className="font-mono text-caption text-ink-subtle">{row.studentCode}</span>
      </Link>
    ),
  },
  {
    id: "segment",
    header: "Segment",
    cell: (row) => <SegmentTag segment={row.enrolmentChannel} />,
  },
  { id: "email", header: "Email", cell: (row) => row.email },
  {
    id: "phone",
    header: "Phone",
    cell: (row) =>
      row.phone === null ? (
        <span className="text-ink-subtle">—</span>
      ) : (
        <span className="font-mono text-body-sm">{row.phone}</span>
      ),
  },
  {
    id: "discipline",
    header: "Discipline",
    cell: (row) => row.discipline ?? <span className="text-ink-subtle">—</span>,
  },
  {
    id: "credentials",
    header: "Credentials",
    cell: (row) =>
      row.credentialsIssuedAt === null ? (
        <StatusPill intent="warning">Not issued</StatusPill>
      ) : (
        <StatusPill intent="success">Issued</StatusPill>
      ),
  },
  {
    id: "status",
    header: "Status",
    cell: (row) => (
      <StatusPill intent={row.accountStatus === "ACTIVE" ? "success" : "neutral"}>
        {row.accountStatus.toLowerCase()}
      </StatusPill>
    ),
  },
];

export default async function BatchRosterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("batches");
  const { id } = await params;
  const query = await searchParams;
  const batch = await getBatch(id);

  // One page of sessions serves both tab counts — the total comes off the page
  // itself, and the recorded count needs the rows anyway.
  const [students, sessions] = await Promise.all([
    listStudents({ ...query, batchId: id }),
    listSessions({ batchId: id, pageSize: "200" }),
  ]);

  const recorded = sessions.rows.filter((s) => s.hasRecording === true).length;
  const full = batch.maxCapacity !== null && students.total >= batch.maxCapacity;

  return (
    <PageBody>
      <BatchHeader
        batch={batch}
        counts={{ sessions: sessions.total, students: students.total, recordings: recorded }}
      />

      {/* Allocation refuses a full batch outright, so this is what an operator
          hits next rather than a soft warning. */}
      {full ? (
        <Alert intent="warning" title="This batch is full">
          {formatCount(students.total)} of {batch.maxCapacity} seats are taken. Allocation will
          refuse another student until the seat cap is raised.
        </Alert>
      ) : null}

      <PageSection
        title={`Roster — ${formatCount(students.total)} student${students.total === 1 ? "" : "s"}`}
        description={
          batch.segment === "COLLEGE"
            ? "Dedicated to this college. A retail student can never join — the two rosters never mix."
            : "An open retail cohort. A college student can never join — the two rosters never mix."
        }
        action={
          <Link
            href="/students/unallocated"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            Allocate a student
          </Link>
        }
      >
        <Card padding="none" className="overflow-hidden">
          <DataTable
            columns={COLUMNS}
            rows={students.rows}
            getRowId={(row) => row.studentId}
            caption="Students enrolled on this batch"
            minWidth="1200px"
            empty={
              <EmptyState
                title="Nobody enrolled yet"
                description="Allocation is what puts a student on a roster — it writes the batch mapping, session access, ledger and credentials in one transaction."
              />
            }
          />
        </Card>
        <Pagination
          page={students.page}
          pageCount={students.totalPages}
          hrefForPage={(n) =>
            withParam(`/batches/${batch.batchId}/roster`, query, "page", String(n))
          }
          summary={pageSummary(students.page, students.pageSize, students.total)}
        />
      </PageSection>
    </PageBody>
  );
}
