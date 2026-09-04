import type { Metadata } from "next";
import Link from "next/link";
import type { Batch, CollegeDetail, Student } from "@gurukulam/contracts";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody, PageSection } from "@/components/patterns/page-section";
import { SegmentTag } from "@/components/patterns/segment-tag";
import { StatTile, StatTileGrid } from "@/components/patterns/stat-tile";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Column, DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { StatusPill } from "@/components/ui/status-pill";
import {
  getCollege,
  listCollegeBatches,
  listCollegeStudents,
} from "@/features/colleges/server/colleges-service";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";
import { brandTokens, domainTokens, feedbackTokens } from "@/design-system/tokens";
import { formatCount } from "@/lib/format";

export const metadata: Metadata = { title: "College" };

const fullName = (s: Student) =>
  s.lastName === null ? s.firstName : `${s.firstName} ${s.lastName}`;

const STUDENT_COLUMNS: Column<Student>[] = [
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
  { id: "email", header: "Email", cell: (row) => <span className="text-body-sm text-ink-muted">{row.email}</span> },
  {
    id: "discipline",
    header: "Discipline",
    cell: (row) => (row.discipline === null ? <span className="text-ink-subtle">—</span> : <Chip>{row.discipline}</Chip>),
  },
  {
    id: "passout",
    header: "Passout",
    align: "end",
    cell: (row) => (row.passoutYear === null ? <span className="text-ink-subtle">—</span> : <span className="tabular-nums">{row.passoutYear}</span>),
  },
  {
    id: "allocation",
    header: "Allocation",
    cell: (row) =>
      row.isAllocated === false ? (
        <StatusPill intent="warning">Unallocated</StatusPill>
      ) : (
        <span className="text-body-sm text-ink-muted tabular-nums">
          {row.batchCount ?? 0} {row.batchCount === 1 ? "batch" : "batches"}
        </span>
      ),
  },
];

const BATCH_COLUMNS: Column<Batch>[] = [
  {
    id: "batch",
    header: "Batch",
    cell: (row) => (
      <Link href={`/batches/${row.batchId}`} className="flex flex-col hover:underline">
        <span className="text-body font-semibold text-ink">{row.name}</span>
        <span className="font-mono text-caption text-ink-subtle">{row.batchCode}</span>
      </Link>
    ),
  },
  { id: "course", header: "Course", cell: (row) => row.courseName ?? <span className="text-ink-subtle">—</span> },
  { id: "trainer", header: "Trainer", cell: (row) => row.primaryTrainerName ?? <span className="text-ink-subtle">Not assigned</span> },
  {
    id: "students",
    header: "Students",
    align: "end",
    cell: (row) => <span className="tabular-nums">{formatCount(row.enrolledCount ?? 0)}</span>,
  },
  {
    id: "starts",
    header: "Starts",
    cell: (row) => (
      <span className="text-body-sm text-ink-muted">
        {new Date(row.startDate).toLocaleDateString("en-IN")}
      </span>
    ),
  },
  {
    id: "status",
    header: "Status",
    cell: (row) => (
      <StatusPill intent={row.status === "COMPLETED" ? "success" : "info"}>
        {row.status.replace(/_/g, " ").toLowerCase()}
      </StatusPill>
    ),
  },
];

function Contacts({ college }: { college: CollegeDetail }) {
  const manage = (
    <Link
      href={`/colleges/${college.collegeId}/contacts`}
      className={buttonVariants({ variant: "secondary", size: "sm" })}
    >
      {college.pocs.length === 0 ? "Add a contact" : "Manage contacts"}
    </Link>
  );

  if (college.pocs.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No contacts on record"
          description="A college is an actor we deal with through people. Without a contact there is nobody to raise a requirement or approve certificate names."
          action={manage}
        />
      </Card>
    );
  }

  return (
    <Card padding="none" className="overflow-hidden">
      <ul className="flex flex-col">
        {college.pocs.map((poc) => (
          <li
            key={poc.pocId}
            className="flex flex-wrap items-center gap-4 border-b border-hairline p-4 last:border-b-0"
          >
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-body font-semibold text-ink">{poc.name}</span>
                {/* Exactly one contact is primary — that is who we deal with. */}
                {poc.isPrimary ? <Chip variant="solid" color={feedbackTokens.success}>Primary</Chip> : null}
              </span>
              <span className="block text-body-sm text-ink-muted">
                {[poc.designation, poc.department].filter(Boolean).join(" · ") || "—"}
              </span>
            </span>
            <span className="flex flex-col text-body-sm">
              <a href={`mailto:${poc.email}`} className="text-gold underline-offset-4 hover:underline">
                {poc.email}
              </a>
              {poc.phone === null ? null : (
                <span className="font-mono text-caption text-ink-subtle">{poc.phone}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex justify-end border-t border-hairline p-4">{manage}</div>
    </Card>
  );
}

export default async function CollegeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("colleges");
  const { id } = await params;
  const query = await searchParams;

  const college = await getCollege(id);
  const [students, batches] = await Promise.all([
    listCollegeStudents(id, query),
    listCollegeBatches(id),
  ]);

  return (
    <PageBody>
      <PageHeader
        eyebrow="Colleges"
        title={college.name}
        description={`${college.collegeCode}${college.cityName === null || college.cityName === undefined ? "" : ` · ${college.cityName}`}`}
        breadcrumbs={[{ label: "Colleges", href: "/colleges" }, { label: college.name }]}
        action={
          <div className="flex items-center gap-3">
            <Link
              href={`/colleges/${college.collegeId}/access`}
              className={buttonVariants({ variant: "secondary" })}
            >
              Portal access
            </Link>
            <Link
              href={`/colleges/${college.collegeId}/edit`}
              className={buttonVariants({ variant: "secondary" })}
            >
              Edit college
            </Link>
          </div>
        }
      />

      {query["contacts"] === "1" ? (
        <Alert intent="success" title="Saved">
          Contacts updated. Anyone taken off the list keeps their history.
        </Alert>
      ) : query["saved"] === "1" ? (
        <Alert intent="success" title="Saved">
          College updated.
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <StatusPill intent={college.isActive ? "success" : "neutral"}>
          {college.isActive ? "Active" : "Inactive"}
        </StatusPill>
        {college.affiliation === null ? null : <Chip>{college.affiliation}</Chip>}
        {college.website === null ? null : (
          <a
            href={college.website}
            className="inline-flex items-center gap-1.5 text-body-sm text-gold underline-offset-4 hover:underline"
          >
            <Icon name="globe" size={15} />
            {college.website.replace(/^https?:\/\//, "")}
          </a>
        )}
        {college.disciplines.map((discipline) => (
          <Chip key={discipline}>{discipline}</Chip>
        ))}
      </div>

      <StatTileGrid>
        <StatTile
          label="Students"
          value={formatCount(students.total)}
          caption="Sent by this institution"
          icon="users"
          color={domainTokens.students}
        />
        <StatTile
          label="Batches"
          value={formatCount(batches.total)}
          caption="Dedicated to this college"
          icon="batch"
          color={domainTokens.trainers}
        />
        <StatTile
          label="Contacts"
          value={formatCount(college.pocs.length)}
          caption={
            college.pocs.some((p) => p.isPrimary) ? "One primary" : "No primary contact set"
          }
          icon="acct"
          color={brandTokens.brand}
        />
        <StatTile
          label="Open requirements"
          value={formatCount(college.openRequirementCount ?? 0)}
          caption="Awaiting confirmation"
          icon="brief"
          color={
            (college.openRequirementCount ?? 0) === 0
              ? brandTokens.inkMuted
              : feedbackTokens.warning
          }
          href="/colleges/requirements"
        />
      </StatTileGrid>

      <PageSection
        title="Points of contact"
        description="Everyone we deal with at this institution, and which of them is primary."
      >
        <Contacts college={college} />
      </PageSection>

      <PageSection
        title="Trainings"
        description="A batch attached to this college is dedicated to it — retail students can never join."
      >
        <Card padding="none" className="overflow-hidden">
          <DataTable
            columns={BATCH_COLUMNS}
            rows={batches.rows}
            getRowId={(row) => row.batchId}
            caption="Batches dedicated to this college"
            minWidth="1000px"
            empty={
              <EmptyState
                title="No batches yet"
                description="Confirming a training requirement is what creates this college's first dedicated batch."
              />
            }
          />
        </Card>
        {batches.total > batches.rows.length ? (
          <p className="mt-3 text-body-sm text-ink-muted">
            Showing {batches.rows.length} of {formatCount(batches.total)}.{" "}
            <Link
              href={`/batches?collegeId=${college.collegeId}`}
              className="text-gold underline-offset-4 hover:underline"
            >
              See all in Batches
            </Link>
          </p>
        ) : null}
      </PageSection>

      <PageSection
        title="Students"
        description="Added by this institution, and billed through its contract rather than individually."
      >
        <Card padding="none" className="overflow-hidden">
          <DataTable
            columns={STUDENT_COLUMNS}
            rows={students.rows}
            getRowId={(row) => row.studentId}
            caption="Students sent by this college"
            minWidth="1000px"
            empty={
              <EmptyState
                title="No students yet"
                description="A college adds its own students from the college portal, or an admin adds them here."
              />
            }
          />
        </Card>
        {students.total > students.rows.length ? (
          <p className="mt-3 text-body-sm text-ink-muted">
            Showing {students.rows.length} of {formatCount(students.total)}.{" "}
            <Link
              href={`/students?collegeId=${college.collegeId}`}
              className="text-gold underline-offset-4 hover:underline"
            >
              See all in the student directory
            </Link>
          </p>
        ) : null}
      </PageSection>
    </PageBody>
  );
}
