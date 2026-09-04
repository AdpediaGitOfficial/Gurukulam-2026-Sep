import type { Metadata } from "next";
import Link from "next/link";
import type { BatchSession, TrainerAssignment } from "@gurukulam/contracts";

import { PageBody, PageSection } from "@/components/patterns/page-section";
import { StatTile, StatTileGrid } from "@/components/patterns/stat-tile";
import { Card } from "@/components/ui/card";
import { Column, DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { BatchHeader } from "@/features/batches/components/batch-header";
import { getBatch, listSessions } from "@/features/batches/server/batches-service";
import { listStudents } from "@/features/students/server/students-service";
import { requireModule } from "@/server/principal";
import { brandTokens, domainTokens, feedbackTokens } from "@/design-system/tokens";
import { formatCount } from "@/lib/format";

export const metadata: Metadata = { title: "Batch" };

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
    id: "topic",
    header: "Topic",
    cell: (row) =>
      row.topicTitle ?? <span className="text-ink-subtle">Not mapped to a topic</span>,
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
    id: "trainer",
    header: "Trainer",
    cell: (row) => row.trainerName ?? <span className="text-ink-subtle">—</span>,
  },
  {
    id: "where",
    header: "Room / link",
    cell: (row) =>
      row.meetingLink !== null ? (
        <a
          href={row.meetingLink}
          className="text-body-sm text-gold underline-offset-4 hover:underline"
        >
          Meeting link
        </a>
      ) : (
        <span className="text-body-sm text-ink-muted">{row.venue ?? "—"}</span>
      ),
  },
  {
    id: "assignments",
    header: "Assignments",
    align: "end",
    // A session must be marked complete before assignments can be set against
    // it, so a dash here is a rule rather than missing data.
    cell: (row) =>
      row.status === "COMPLETED" ? (
        <span className="tabular-nums">{formatCount(row.assignmentCount ?? 0)}</span>
      ) : (
        <span className="text-ink-subtle">—</span>
      ),
  },
  {
    id: "status",
    header: "Status",
    cell: (row) => (
      <StatusPill
        intent={
          row.status === "COMPLETED"
            ? "success"
            : row.status === "CANCELLED"
              ? "neutral"
              : row.status === "LIVE"
                ? "warning"
                : "info"
        }
      >
        {row.status.toLowerCase()}
      </StatusPill>
    ),
  },
];

/**
 * The trainer handshake, in full.
 *
 * An admin proposes and the trainer confirms; only a confirmed assignment is
 * committed delivery. The history stays rather than collapsing to one name,
 * because a decline and who declined it is the reason a batch has nobody.
 */
function Assignments({ assignments }: { assignments: readonly TrainerAssignment[] }) {
  if (assignments.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Nobody proposed yet"
          description="A trainer is proposed from the batch's own screen and only becomes delivery once they confirm."
        />
      </Card>
    );
  }

  return (
    <Card padding="none" className="overflow-hidden">
      <ul className="flex flex-col">
        {assignments.map((assignment) => (
          <li
            key={assignment.assignmentId}
            className="flex flex-wrap items-center gap-4 border-b border-hairline p-4 last:border-b-0"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-body font-semibold text-ink">
                {assignment.trainerName ?? "—"}
              </span>
              <span className="block text-caption text-ink-subtle">
                Proposed {assignment.proposedAt.slice(0, 10)}
                {assignment.respondedAt === null
                  ? " · awaiting an answer"
                  : ` · answered ${assignment.respondedAt.slice(0, 10)}`}
              </span>
              {assignment.declineReason === null ? null : (
                <span className="block text-body-sm text-ink-muted">
                  “{assignment.declineReason}”
                </span>
              )}
            </span>
            <StatusPill
              intent={
                assignment.status === "CONFIRMED"
                  ? "success"
                  : assignment.status === "DECLINED"
                    ? "danger"
                    : "warning"
              }
            >
              {assignment.status.toLowerCase()}
            </StatusPill>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default async function BatchSessionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModule("batches");
  const { id } = await params;
  const batch = await getBatch(id);

  const [sessions, students] = await Promise.all([
    listSessions({ batchId: id, pageSize: "200", sort: "scheduledDate", order: "asc" }),
    listStudents({ batchId: id, pageSize: "1" }),
  ]);

  const delivered = sessions.rows.filter((s) => s.status === "COMPLETED").length;
  const recorded = sessions.rows.filter((s) => s.hasRecording === true).length;
  const assignments = sessions.rows.reduce((sum, s) => sum + (s.assignmentCount ?? 0), 0);

  return (
    <PageBody>
      <BatchHeader
        batch={batch}
        counts={{ sessions: sessions.total, students: students.total, recordings: recorded }}
      />

      <StatTileGrid>
        <StatTile
          label="Sessions"
          value={formatCount(sessions.total)}
          caption={
            sessions.total === 0
              ? "None scheduled yet"
              : `${delivered} delivered · ${sessions.total - delivered} to go`
          }
          icon="batch"
          color={domainTokens.trainers}
        />
        <StatTile
          label="Students"
          value={formatCount(students.total)}
          caption={
            batch.maxCapacity === null
              ? "No seat cap set"
              : `${batch.maxCapacity - students.total} seat(s) left of ${batch.maxCapacity}`
          }
          icon="users"
          color={domainTokens.students}
          href={`/batches/${batch.batchId}/roster`}
        />
        <StatTile
          label="Assignments"
          value={formatCount(assignments)}
          caption="Set against delivered sessions"
          icon="task"
          color={brandTokens.gold}
        />
        <StatTile
          label="Recordings"
          value={formatCount(recorded)}
          caption={
            delivered - recorded > 0
              ? `${delivered - recorded} delivered session(s) unrecorded`
              : "Every delivered session is recorded"
          }
          icon="play"
          color={delivered - recorded > 0 ? feedbackTokens.warning : brandTokens.inkMuted}
          href={`/batches/${batch.batchId}/recordings`}
        />
      </StatTileGrid>

      <PageSection
        title="Session schedule"
        description="A session must be marked complete before assignments can be set against it — completion is a deliberate act, not a date passing."
        action={
          <Link
            href={`/batches/sessions?batchId=${batch.batchId}`}
            className="text-body-sm text-gold underline-offset-4 hover:underline"
          >
            Open in Sessions
          </Link>
        }
      >
        <Card padding="none" className="overflow-hidden">
          <DataTable
            columns={SESSION_COLUMNS}
            rows={sessions.rows}
            getRowId={(row) => row.sessionId}
            caption="Every session scheduled for this batch"
            minWidth="1300px"
            empty={
              <EmptyState
                title="No sessions scheduled"
                description="A batch with no sessions has nothing to deliver. Sessions are scheduled under the course's topics."
              />
            }
          />
        </Card>
      </PageSection>

      <PageSection
        title="Trainer"
        description="An admin proposes; the trainer confirms. Only a confirmed assignment is committed delivery."
      >
        <Assignments assignments={batch.trainerAssignments} />
      </PageSection>
    </PageBody>
  );
}
