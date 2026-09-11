import type { Metadata } from "next";
import Link from "next/link";
import type { BatchSession, TrainerAssignment } from "@gurukulam/contracts";

import { PageBody, PageSection } from "@/components/patterns/page-section";
import { rowActions } from "@/components/patterns/row-actions";
import { ConfirmAction, ConfirmWithReason } from "@/components/patterns/confirm-with-reason";
import { StatTile, StatTileGrid } from "@/components/patterns/stat-tile";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Column, DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { BatchHeader } from "@/features/batches/components/batch-header";
import { getBatch, listSessions } from "@/features/batches/server/batches-service";
import { releaseTrainer, respondToProposal } from "@/features/batches/server/actions";
import { listStudents } from "@/features/students/server/students-service";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";
import { brandTokens, domainTokens, feedbackTokens } from "@/design-system/tokens";
import { formatCount } from "@/lib/format";

export const metadata: Metadata = { title: "Batch" };

const SESSION_COLUMNS: Column<BatchSession>[] = [
  {
    id: "session",
    header: "Session",
    cell: (row) => (
      <Link
        href={`/batches/sessions/${row.sessionId}`}
        className="flex flex-col hover:underline"
      >
        <span className="text-body font-semibold text-ink">{row.title}</span>
        <span className="font-mono text-caption text-ink-subtle">{row.sessionCode}</span>
      </Link>
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
    id: "recording",
    header: "Recording",
    // Only meaningful once delivered — a scheduled session has nothing to
    // record, so a dash there is the rule rather than a gap.
    cell: (row) =>
      row.status !== "COMPLETED" ? (
        <span className="text-ink-subtle">—</span>
      ) : row.hasRecording === true ? (
        <StatusPill intent="success">Linked</StatusPill>
      ) : (
        <StatusPill intent="warning">Missing</StatusPill>
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
  rowActions((row) => [{ label: "Open", href: `/batches/sessions/${row.sessionId}` }]),
];

/**
 * The trainer handshake, in full.
 *
 * An admin proposes and the trainer confirms; only a confirmed assignment is
 * committed delivery. The history stays rather than collapsing to one name,
 * because a decline and who declined it is the reason a batch has nobody.
 *
 * An in-house trainer is confirmed as they are allocated, and the row says so:
 * "they agreed" and "we assigned them" are different facts, and a reader six
 * months later cannot tell them apart from a timestamp.
 */
function Assignments({
  batchId,
  assignments,
}: {
  batchId: string;
  assignments: readonly TrainerAssignment[];
}) {
  if (assignments.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Nobody assigned yet"
          description="A freelancer is proposed and becomes delivery once they confirm. An in-house trainer is confirmed as they are allocated."
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
            className={
              assignment.releasedAt === null
                ? "flex flex-wrap items-center gap-4 border-b border-hairline p-4 last:border-b-0"
                : "flex flex-wrap items-center gap-4 border-b border-hairline p-4 opacity-70 last:border-b-0"
            }
          >
            <span className="min-w-0 flex-1">
              <span className="block text-body font-semibold text-ink">
                {assignment.trainerName ?? "—"}
              </span>
              <span className="block text-caption text-ink-subtle">
                {assignment.autoConfirmed
                  ? `Allocated ${assignment.proposedAt.slice(0, 10)} · in-house, confirmed without asking`
                  : assignment.respondedAt === null
                    ? `Proposed ${assignment.proposedAt.slice(0, 10)} · awaiting an answer`
                    : `Proposed ${assignment.proposedAt.slice(0, 10)} · answered ${assignment.respondedAt.slice(0, 10)}`}
              </span>
              {assignment.declineReason === null ? null : (
                <span className="block text-body-sm text-ink-muted">
                  “{assignment.declineReason}”
                </span>
              )}
              {assignment.releasedAt === null ? null : (
                <span className="block text-body-sm text-ink-muted">
                  Released {assignment.releasedAt.slice(0, 10)}
                  {assignment.releaseReason === null
                    ? ""
                    : ` — “${assignment.releaseReason}”`}
                </span>
              )}
            </span>
            <StatusPill
              intent={
                assignment.releasedAt !== null
                  ? "neutral"
                  : assignment.status === "CONFIRMED"
                    ? "success"
                    : assignment.status === "DECLINED"
                      ? "danger"
                      : "warning"
              }
            >
              {assignment.releasedAt === null ? assignment.status.toLowerCase() : "released"}
            </StatusPill>

            {/* An admin records the answer on the trainer's behalf: the admin
                portal performs every action the deferred portals will. */}
            {assignment.releasedAt === null && assignment.status === "PROPOSED" ? (
              <>
                <ConfirmAction
                  action={respondToProposal.bind(null, batchId, "CONFIRM")}
                  label="Confirm"
                  pending="Confirming…"
                  subject={assignment.trainerName ?? "this trainer"}
                  variant="primary"
                />
                <ConfirmWithReason
                  id={`decline-${assignment.assignmentId}`}
                  subject={assignment.trainerName ?? "this trainer"}
                  action={respondToProposal.bind(null, batchId, "DECLINE")}
                  trigger="Decline"
                  confirm="Record the decline"
                  pending="Recording…"
                  required
                  reasonPlaceholder="Already committed that fortnight"
                  reasonHint="Kept on the record, so whoever proposes next knows what happened."
                  description={
                    <>
                      The batch goes back to unassigned. Nothing is reassigned automatically.
                    </>
                  }
                />
              </>
            ) : null}

            {assignment.releasedAt === null && assignment.status === "CONFIRMED" ? (
              <ConfirmWithReason
                id={`release-${assignment.assignmentId}`}
                subject={assignment.trainerName ?? "this trainer"}
                action={releaseTrainer.bind(null, batchId)}
                trigger="Release"
                confirm="Release the trainer"
                pending="Releasing…"
                required
                reasonPlaceholder="Moved to the Kochi cohort"
                reasonHint="Kept on the released assignment, so the change is not unexplained."
                description={
                  <>
                    The batch loses its trainer and its scheduled sessions are cleared, freeing
                    that time on the calendar. Sessions already completed keep who delivered them.
                  </>
                }
              />
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default async function BatchSessionsPage({
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

      {query["session"] === "1" ? (
        <Alert intent="success" title="Session scheduled">
          Mark it delivered once it has been taught — that is what releases its assignments and
          lets its recording be attached.
        </Alert>
      ) : query["confirmed"] === "1" ? (
        <Alert intent="success" title="Trainer confirmed">
          They are this batch&rsquo;s trainer now, and its scheduled sessions carry them — so the
          time reads as committed on the availability calendar.
        </Alert>
      ) : query["declined"] === "1" ? (
        <Alert intent="info" title="Decline recorded">
          The batch is unassigned again. Nothing was reassigned automatically — propose someone
          else when you are ready.
        </Alert>
      ) : query["released"] === "1" ? (
        <Alert intent="info" title="Trainer released">
          The batch has nobody on it and its scheduled sessions are free again. Sessions already
          delivered keep who taught them.
        </Alert>
      ) : null}

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
          <div className="flex items-center gap-4">
            <Link
              href={`/batches/sessions?batchId=${batch.batchId}`}
              className="text-body-sm text-gold underline-offset-4 hover:underline"
            >
              Open in Sessions
            </Link>
            <Link
              href={`/batches/${batch.batchId}/sessions/new`}
              className={buttonVariants({ variant: "primary", size: "sm" })}
            >
              Schedule a session
            </Link>
          </div>
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
                action={
                  <Link
                    href={`/batches/${batch.batchId}/sessions/new`}
                    className={buttonVariants({ variant: "primary" })}
                  >
                    Schedule the first session
                  </Link>
                }
              />
            }
          />
        </Card>
      </PageSection>

      <PageSection
        title="Trainer"
        description="A freelancer is proposed and answers for themselves. An in-house trainer is staff, so allocating them confirms them — the approval and double-booking checks apply either way."
      >
        <Assignments batchId={batch.batchId} assignments={batch.trainerAssignments} />
      </PageSection>
    </PageBody>
  );
}
