import type { Metadata } from "next";
import Link from "next/link";
import {
  formatRupees,
  fromWire,
  type Batch,
  type CourseTopic,
  type Trainer,
} from "@gurukulam/contracts";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody, PageSection } from "@/components/patterns/page-section";
import { SegmentTag } from "@/components/patterns/segment-tag";
import { StatTile, StatTileGrid } from "@/components/patterns/stat-tile";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Column, DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { getCourse } from "@/features/courses/server/courses-service";
import { listBatches } from "@/features/batches/server/batches-service";
import { listStudents } from "@/features/students/server/students-service";
import { listTrainers } from "@/features/trainers/server/trainers-service";
import { requireModule } from "@/server/principal";
import { brandTokens, domainTokens } from "@/design-system/tokens";
import { formatCount } from "@/lib/format";

export const metadata: Metadata = { title: "Course" };

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
  { id: "segment", header: "Segment", cell: (row) => <SegmentTag segment={row.segment} /> },
  {
    id: "college",
    header: "College",
    cell: (row) =>
      row.collegeName ?? <span className="text-ink-subtle">Open cohort</span>,
  },
  {
    id: "trainer",
    header: "Trainer",
    cell: (row) =>
      row.primaryTrainerName ?? <span className="text-ink-subtle">Not confirmed</span>,
  },
  { id: "start", header: "Starts", cell: (row) => row.startDate },
  {
    id: "enrolled",
    header: "Enrolled",
    align: "end",
    cell: (row) => (
      <span className="tabular-nums">
        {formatCount(row.enrolledCount ?? 0)}
        {row.maxCapacity === null ? "" : ` / ${row.maxCapacity}`}
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

const TRAINER_COLUMNS: Column<Trainer>[] = [
  {
    id: "trainer",
    header: "Trainer",
    cell: (row) => (
      <Link href={`/trainers/${row.trainerId}`} className="flex flex-col hover:underline">
        <span className="text-body font-semibold text-ink">{row.name}</span>
        <span className="font-mono text-caption text-ink-subtle">{row.trainerCode}</span>
      </Link>
    ),
  },
  {
    id: "city",
    header: "Based in",
    cell: (row) => row.cityName ?? <span className="text-ink-subtle">—</span>,
  },
  {
    id: "skills",
    header: "Skills",
    cell: (row) =>
      row.skillTags.length === 0 ? (
        <span className="text-ink-subtle">—</span>
      ) : (
        <span className="flex flex-wrap gap-1.5">
          {row.skillTags.slice(0, 3).map((tag) => (
            <Chip key={tag}>{tag}</Chip>
          ))}
        </span>
      ),
  },
  {
    id: "approved",
    header: "Approved for",
    align: "end",
    cell: (row) => (
      <span className="tabular-nums">{formatCount(row.approvedCourseCount ?? 0)} courses</span>
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

/**
 * The course's structure.
 *
 * Topics are listed with their hours, not with their sessions: a session
 * belongs to a BATCH, not to the course, so "the sessions under this topic"
 * is a different list for every cohort running it. The batches below are where
 * those actually live.
 */
function Topics({ topics }: { topics: readonly CourseTopic[] }) {
  if (topics.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No topics yet"
          description="A course holds topics and a topic carries sessions, so a course with none cannot have a schedule built against it."
        />
      </Card>
    );
  }

  return (
    <Card padding="none" className="overflow-hidden">
      <ol className="flex flex-col">
        {topics.map((topic) => (
          <li
            key={topic.topicId}
            className="flex items-start gap-4 border-b border-hairline p-4 last:border-b-0"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken font-mono text-body-sm text-ink-muted">
              {topic.sequence}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-body font-semibold text-ink">{topic.title}</span>
              {topic.description === null ? null : (
                <span className="block text-body-sm text-ink-muted">{topic.description}</span>
              )}
            </span>
            <span className="shrink-0 text-body-sm text-ink-muted tabular-nums">
              {topic.durationHours === null ? "—" : `${topic.durationHours} h`}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

export default async function CourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModule("courses");
  const { id } = await params;
  const course = await getCourse(id);

  const [batches, trainers, students] = await Promise.all([
    listBatches({ courseId: id, pageSize: "10", sort: "startDate", order: "desc" }),
    listTrainers({ approvedForCourseId: id, pageSize: "10" }),
    listStudents({ courseId: id, pageSize: "1" }),
  ]);

  // Hours the syllabus accounts for. Topics may leave it unset, so this is the
  // hours MAPPED rather than the course's own duration — the two disagreeing
  // is exactly the kind of gap worth showing.
  const mappedHours = course.topics.reduce((sum, topic) => sum + (topic.durationHours ?? 0), 0);
  const college = batches.rows.filter((batch) => batch.segment === "COLLEGE").length;

  return (
    <PageBody>
      <PageHeader
        eyebrow="Courses"
        title={course.name}
        description={[
          course.courseCode,
          course.category,
          course.durationWeeks === null ? null : `${course.durationWeeks} weeks`,
          formatRupees(fromWire(course.standardMarketValueMinor), { paise: false }),
        ]
          .filter(Boolean)
          .join(" · ")}
        breadcrumbs={[{ label: "Courses", href: "/courses" }, { label: course.name }]}
        action={
          <Link
            href={`/courses/${course.courseId}/edit`}
            className={buttonVariants({ variant: "secondary" })}
          >
            Edit course
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusPill intent={course.isActive ? "success" : "neutral"}>
          {course.isActive ? "Active" : "Archived"}
        </StatusPill>
        {course.attendanceFloorPct === null ? null : (
          <Chip>{course.attendanceFloorPct}% attendance floor</Chip>
        )}
        {course.syllabusUrl === null ? null : (
          <a
            href={course.syllabusUrl}
            className="text-body-sm text-gold underline-offset-4 hover:underline"
          >
            Syllabus
          </a>
        )}
      </div>

      <StatTileGrid>
        <StatTile
          label="Topics"
          value={formatCount(course.topics.length)}
          caption={mappedHours === 0 ? "No hours mapped yet" : `${mappedHours} hours mapped`}
          icon="book"
          color={domainTokens.courses}
        />
        <StatTile
          label="Batches"
          value={formatCount(batches.total)}
          caption={
            batches.total === 0
              ? "None running this course"
              : `${college} college · ${batches.rows.length - college} retail, of the latest ${batches.rows.length}`
          }
          icon="batch"
          color={domainTokens.trainers}
          href={`/batches?courseId=${course.courseId}`}
        />
        <StatTile
          label="Approved trainers"
          value={formatCount(trainers.total)}
          caption={
            trainers.total === 0
              ? "Nobody may take this course yet"
              : "Who may be proposed for a batch"
          }
          icon="trainer"
          color={
            trainers.total === 0 ? brandTokens.inkMuted : domainTokens.trainers
          }
        />
        <StatTile
          label="Students"
          value={formatCount(students.total)}
          caption="Enrolled across every batch"
          icon="users"
          color={domainTokens.students}
          href={`/students?courseId=${course.courseId}`}
        />
      </StatTileGrid>

      {course.description === null ? null : (
        <Card>
          <p className="max-w-3xl text-body text-ink-muted">{course.description}</p>
        </Card>
      )}

      <PageSection
        title="Topics"
        description="A course holds topics; a topic carries sessions. Sessions are scheduled per batch, so the same topic runs on a different date for every cohort."
        action={
          <Link
            href={`/courses/${course.courseId}/edit`}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            Edit topics
          </Link>
        }
      >
        <Topics topics={course.topics} />
      </PageSection>

      <PageSection
        title="Batches"
        description="Every cohort running this course, newest first."
      >
        <Card padding="none" className="overflow-hidden">
          <DataTable
            columns={BATCH_COLUMNS}
            rows={batches.rows}
            getRowId={(row) => row.batchId}
            caption="Batches running this course"
            minWidth="1100px"
            empty={
              <EmptyState
                title="No batches yet"
                description="A retail batch is created from Batches; a college batch comes from confirming that college's requirement."
              />
            }
          />
        </Card>
        {batches.total > batches.rows.length ? (
          <p className="mt-3 text-body-sm text-ink-muted">
            Showing {batches.rows.length} of {formatCount(batches.total)}.{" "}
            <Link
              href={`/batches?courseId=${course.courseId}`}
              className="text-gold underline-offset-4 hover:underline"
            >
              See all in Batches
            </Link>
          </p>
        ) : null}
      </PageSection>

      <PageSection
        title="Approved trainers"
        description="Approval is a relationship, not a skill tag — a batch of this course may only be proposed to someone on this list."
      >
        <Card padding="none" className="overflow-hidden">
          <DataTable
            columns={TRAINER_COLUMNS}
            rows={trainers.rows}
            getRowId={(row) => row.trainerId}
            caption="Trainers approved to deliver this course"
            minWidth="1000px"
            empty={
              <EmptyState
                title="Nobody is approved yet"
                description="Until someone is, no batch of this course can be given a trainer. Approvals are granted on the trainer's own record."
              />
            }
          />
        </Card>
      </PageSection>
    </PageBody>
  );
}
