import type { Metadata } from "next";
import Link from "next/link";
import {
  formatRupees,
  fromWire,
  type ApprovedCourse,
  type Availability,
  type Batch,
  type BatchSession,
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
import { listBatches, listSessions } from "@/features/batches/server/batches-service";
import { getTrainer, listAvailability } from "@/features/trainers/server/trainers-service";
import { requireModule } from "@/server/principal";
import { brandTokens, domainTokens, feedbackTokens } from "@/design-system/tokens";
import { formatCount } from "@/lib/format";

export const metadata: Metadata = { title: "Trainer" };

const PAY_MODEL: Record<string, string> = {
  PER_HOUR: "per hour",
  PER_SESSION: "per session",
  MONTHLY: "monthly",
  PER_BATCH: "per batch",
};

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
  {
    id: "course",
    header: "Course",
    cell: (row) => row.courseName ?? <span className="text-ink-subtle">—</span>,
  },
  { id: "segment", header: "Segment", cell: (row) => <SegmentTag segment={row.segment} /> },
  { id: "start", header: "Starts", cell: (row) => row.startDate },
  {
    id: "enrolled",
    header: "Enrolled",
    align: "end",
    cell: (row) => <span className="tabular-nums">{formatCount(row.enrolledCount ?? 0)}</span>,
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

const SESSION_COLUMNS: Column<BatchSession>[] = [
  {
    id: "session",
    header: "Session",
    cell: (row) => (
      <div className="flex flex-col">
        <span className="text-body font-semibold text-ink">{row.title}</span>
        <span className="font-mono text-caption text-ink-subtle">{row.sessionCode}</span>
      </div>
    ),
  },
  {
    id: "batch",
    header: "Batch",
    cell: (row) => (
      <Link
        href={`/batches/${row.batchId}`}
        className="font-mono text-body-sm text-gold underline-offset-4 hover:underline"
      >
        {row.batchCode ?? "—"}
      </Link>
    ),
  },
  { id: "date", header: "Date", cell: (row) => row.scheduledDate },
  {
    id: "time",
    header: "Time",
    cell: (row) => (
      <span className="font-mono text-body-sm tabular-nums">
        {row.startTime}–{row.endTime}
      </span>
    ),
  },
  {
    id: "where",
    header: "Room / link",
    cell: (row) => (
      <span className="text-body-sm text-ink-muted">
        {row.meetingLink !== null ? "Online" : (row.venue ?? "—")}
      </span>
    ),
  },
  {
    id: "status",
    header: "Status",
    cell: (row) => (
      <StatusPill
        intent={
          row.status === "COMPLETED" ? "success" : row.status === "CANCELLED" ? "neutral" : "info"
        }
      >
        {row.status.toLowerCase()}
      </StatusPill>
    ),
  },
];

/**
 * What this trainer may be proposed for.
 *
 * Approval is a relationship, not a skill tag: a batch may only be given to
 * someone approved for its course, so this list is the whole of what makes a
 * trainer assignable.
 */
function ApprovedCourses({ courses }: { courses: readonly ApprovedCourse[] }) {
  if (courses.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Approved for nothing yet"
          description="A trainer can only take a batch of a course they are approved for, so this one cannot be proposed for anything."
        />
      </Card>
    );
  }

  return (
    <Card padding="none" className="overflow-hidden">
      <ul className="flex flex-col">
        {courses.map((course) => (
          <li
            key={course.courseId}
            className="flex flex-wrap items-center gap-4 border-b border-hairline p-4 last:border-b-0"
          >
            <Link href={`/courses/${course.courseId}`} className="min-w-0 flex-1 hover:underline">
              <span className="block text-body font-semibold text-ink">{course.name}</span>
              <span className="block font-mono text-caption text-ink-subtle">
                {course.courseCode}
              </span>
            </Link>
            <span className="text-body-sm text-ink-muted">
              {/* Nullable: an approval carried over from an import has no date,
                  and inventing one would make the record lie. */}
              {course.approvedAt === null
                ? "Approved"
                : `Approved ${course.approvedAt.slice(0, 10)}`}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * Declared leave and blocked time.
 *
 * Half of free/busy — the other half is the sessions this trainer is committed
 * to, which is why nothing here is stored as "available". The batch service
 * reads both when checking a proposal for clashes.
 */
function Away({ entries }: { entries: readonly Availability[] }) {
  if (entries.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Nothing declared"
          description="No leave or blocked time on record. Availability is still computed from the sessions this trainer is committed to."
        />
      </Card>
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <Card padding="none" className="overflow-hidden">
      <ul className="flex flex-col">
        {entries.map((entry) => {
          const past = entry.endsAt.slice(0, 10) < today;
          return (
            <li
              key={entry.availabilityId}
              className="flex flex-wrap items-center gap-4 border-b border-hairline p-4 last:border-b-0"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-body font-semibold text-ink">
                  {entry.startsAt.slice(0, 10)}
                  {entry.endsAt.slice(0, 10) === entry.startsAt.slice(0, 10)
                    ? ""
                    : ` → ${entry.endsAt.slice(0, 10)}`}
                  {entry.isFullDay ? "" : ` · ${entry.startsAt.slice(11, 16)}–${entry.endsAt.slice(11, 16)}`}
                </span>
                {entry.reason === null ? null : (
                  <span className="block text-body-sm text-ink-muted">{entry.reason}</span>
                )}
              </span>
              <Chip>{entry.type === "LEAVE" ? "Leave" : "Blocked"}</Chip>
              <StatusPill intent={past ? "neutral" : "warning"}>
                {past ? "past" : "upcoming"}
              </StatusPill>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export default async function TrainerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModule("trainers");
  const { id } = await params;
  const trainer = await getTrainer(id);

  const today = new Date().toISOString().slice(0, 10);
  const [batches, upcoming, away] = await Promise.all([
    // Confirmed delivery only: `trainerId` matches the batch's primary
    // trainer, and a batch gains one only once the trainer has confirmed.
    listBatches({ trainerId: id, pageSize: "10", sort: "startDate", order: "desc" }),
    listSessions({ trainerId: id, from: today, pageSize: "10", sort: "scheduledDate", order: "asc" }),
    listAvailability(id),
  ]);

  const awayAhead = away.filter((entry) => entry.endsAt.slice(0, 10) >= today).length;

  return (
    <PageBody>
      <PageHeader
        eyebrow="Trainers"
        title={trainer.name}
        description={[trainer.trainerCode, trainer.email, trainer.cityName]
          .filter(Boolean)
          .join(" · ")}
        breadcrumbs={[{ label: "Trainers", href: "/trainers" }, { label: trainer.name }]}
        action={
          <Link
            href={`/trainers/${trainer.trainerId}/edit`}
            className={buttonVariants({ variant: "secondary" })}
          >
            Edit trainer
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusPill intent={trainer.accountStatus === "ACTIVE" ? "success" : "neutral"}>
          {trainer.accountStatus.toLowerCase()}
        </StatusPill>
        {trainer.qualification === null ? null : <Chip>{trainer.qualification}</Chip>}
        {trainer.experienceYears === null ? null : (
          <Chip>{trainer.experienceYears} years experience</Chip>
        )}
        {trainer.payRateMinor === null || trainer.payModel === null ? null : (
          <Chip>
            {formatRupees(fromWire(trainer.payRateMinor), { paise: false })}{" "}
            {PAY_MODEL[trainer.payModel] ?? trainer.payModel.toLowerCase()}
          </Chip>
        )}
        {trainer.maxWeeklyHours === null ? null : (
          <Chip>Up to {trainer.maxWeeklyHours} h/week</Chip>
        )}
        {trainer.phone === null ? null : (
          <span className="font-mono text-body-sm text-ink-muted">{trainer.phone}</span>
        )}
      </div>

      {trainer.skillTags.length === 0 ? null : (
        <div className="flex flex-wrap items-center gap-2">
          {trainer.skillTags.map((tag) => (
            <Chip key={tag}>{tag}</Chip>
          ))}
        </div>
      )}

      <StatTileGrid>
        <StatTile
          label="Approved courses"
          value={formatCount(trainer.approvedCourses.length)}
          caption={
            trainer.approvedCourses.length === 0
              ? "Cannot be proposed for anything"
              : "What they may be proposed for"
          }
          icon="book"
          color={
            trainer.approvedCourses.length === 0
              ? feedbackTokens.warning
              : domainTokens.courses
          }
        />
        <StatTile
          label="Batches"
          value={formatCount(batches.total)}
          caption="Confirmed delivery — a proposal is not one"
          icon="batch"
          color={domainTokens.trainers}
          href={`/batches?trainerId=${trainer.trainerId}`}
        />
        <StatTile
          label="Sessions ahead"
          value={formatCount(upcoming.total)}
          caption="Scheduled from today"
          icon="cal"
          color={brandTokens.brand}
          href={`/batches/sessions?trainerId=${trainer.trainerId}`}
        />
        <StatTile
          label="Declared away"
          value={formatCount(awayAhead)}
          caption={
            away.length === awayAhead
              ? "Leave or blocked time ahead"
              : `${away.length - awayAhead} past entr${away.length - awayAhead === 1 ? "y" : "ies"} as well`
          }
          icon="clock"
          color={awayAhead === 0 ? brandTokens.inkMuted : feedbackTokens.warning}
        />
      </StatTileGrid>

      <PageSection
        title="Approved courses"
        description="Approval is a relationship, not a skill tag — a batch may only be given to someone approved for its course."
        action={
          <Link
            href={`/trainers/${trainer.trainerId}/edit`}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            Change approvals
          </Link>
        }
      >
        <ApprovedCourses courses={trainer.approvedCourses} />
      </PageSection>

      <PageSection
        title="Batches"
        description="Where this trainer is the confirmed trainer. A proposal awaiting an answer is not delivery, so it does not appear here."
      >
        <Card padding="none" className="overflow-hidden">
          <DataTable
            columns={BATCH_COLUMNS}
            rows={batches.rows}
            getRowId={(row) => row.batchId}
            caption="Batches this trainer is confirmed on"
            minWidth="1000px"
            empty={
              <EmptyState
                title="Not confirmed on any batch"
                description="A trainer is proposed from the batch and becomes its trainer only once they confirm."
              />
            }
          />
        </Card>
      </PageSection>

      <PageSection
        title="Sessions ahead"
        description="What this trainer is committed to from today. These are the other half of free/busy — the clash check reads them alongside the declared time below."
      >
        <Card padding="none" className="overflow-hidden">
          <DataTable
            columns={SESSION_COLUMNS}
            rows={upcoming.rows}
            getRowId={(row) => row.sessionId}
            caption="Sessions scheduled for this trainer from today"
            minWidth="1100px"
            empty={<EmptyState title="Nothing scheduled ahead" />}
          />
        </Card>
        {upcoming.total > upcoming.rows.length ? (
          <p className="mt-3 text-body-sm text-ink-muted">
            Showing {upcoming.rows.length} of {formatCount(upcoming.total)}.{" "}
            <Link
              href={`/batches/sessions?trainerId=${trainer.trainerId}`}
              className="text-gold underline-offset-4 hover:underline"
            >
              See all in Sessions
            </Link>
          </p>
        ) : null}
      </PageSection>

      <PageSection
        title="Declared leave and blocked time"
        description="Free/busy is computed from this plus committed sessions, never stored — which is why declaring leave over a session the trainer is already committed to is refused."
      >
        <Away entries={away} />
      </PageSection>
    </PageBody>
  );
}
