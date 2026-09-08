import type { Metadata } from "next";
import Link from "next/link";

import { ConfirmAction } from "@/components/patterns/confirm-with-reason";
import { PageHeader } from "@/components/patterns/page-header";
import { PageBody, PageSection } from "@/components/patterns/page-section";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { RecordingForm } from "@/features/batches/components/recording-form";
import { completeSession, reopenSession } from "@/features/batches/server/actions";
import { getSession } from "@/features/batches/server/batches-service";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";
import { formatCount } from "@/lib/format";

export const metadata: Metadata = { title: "Session" };

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-hairline py-3 last:border-b-0">
      <dt className="text-body-sm text-ink-subtle">{label}</dt>
      <dd className="text-right text-body-sm font-medium text-ink">{value}</dd>
    </div>
  );
}

export default async function SessionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("batches");
  const { sessionId } = await params;
  const query = await searchParams;
  const session = await getSession(sessionId);

  const delivered = session.status === "COMPLETED";

  return (
    <PageBody>
      <PageHeader
        eyebrow={session.sessionCode}
        title={session.title}
        description={`${session.scheduledDate} · ${session.startTime}–${session.endTime}`}
        breadcrumbs={[
          { label: "Batches", href: "/batches" },
          ...(session.batchCode === null || session.batchCode === undefined
            ? []
            : [{ label: session.batchCode, href: `/batches/${session.batchId}` }]),
          { label: session.title },
        ]}
        action={
          delivered ? (
            <ConfirmAction
              action={reopenSession.bind(null, session.sessionId)}
              label="Reopen"
              pending="Reopening…"
              subject={session.title}
            />
          ) : session.status === "CANCELLED" ? undefined : (
            <ConfirmAction
              action={completeSession.bind(null, session.sessionId)}
              label="Mark delivered"
              pending="Marking…"
              subject={session.title}
              variant="primary"
              size="md"
            />
          )
        }
      />

      {query["completed"] === "1" ? (
        <Alert intent="success" title="Marked delivered">
          Assignments can now be set against it, and its recording can be attached.
        </Alert>
      ) : query["reopened"] === "1" ? (
        <Alert intent="info" title="Reopened">
          It counts as scheduled again. Anything already set against it stays.
        </Alert>
      ) : query["recorded"] === "1" ? (
        <Alert intent="success" title="Recording attached">
          Students on this batch can watch it back.
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <StatusPill
          intent={
            delivered
              ? "success"
              : session.status === "CANCELLED"
                ? "neutral"
                : session.status === "LIVE"
                  ? "warning"
                  : "info"
          }
        >
          {session.status.toLowerCase()}
        </StatusPill>
        <Chip>{session.mode.toLowerCase()}</Chip>
        {session.topicTitle === null || session.topicTitle === undefined ? (
          <Chip>Not mapped to a topic</Chip>
        ) : (
          <Chip>{session.topicTitle}</Chip>
        )}
        {session.trainerName === null || session.trainerName === undefined ? null : (
          <Chip>{session.trainerName}</Chip>
        )}
        {session.rescheduledFrom === null ? null : (
          <span className="text-body-sm text-ink-muted">
            Moved from {session.rescheduledFrom.slice(0, 10)}
            {session.rescheduleReason === null ? "" : ` — “${session.rescheduleReason}”`}
          </span>
        )}
      </div>

      <div className="grid gap-8 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <dl>
            <Row label="Session code" value={<span className="font-mono">{session.sessionCode}</span>} />
            <Row label="Date" value={session.scheduledDate} />
            <Row
              label="Time"
              value={
                <span className="font-mono tabular-nums">
                  {session.startTime}–{session.endTime}
                </span>
              }
            />
            <Row
              label="Where"
              value={
                session.meetingLink !== null ? (
                  <a
                    href={session.meetingLink}
                    className="text-gold underline-offset-4 hover:underline"
                  >
                    Meeting link
                  </a>
                ) : (
                  (session.venue ?? "—")
                )
              }
            />
            <Row
              label="Delivered"
              value={session.completedAt === null ? "Not yet" : session.completedAt.slice(0, 10)}
            />
          </dl>
        </Card>

        <div className="flex flex-col gap-8 xl:col-span-2">
          <PageSection
            title="Recording"
            description="One per delivered session. A student who missed it catches up from here."
          >
            {session.recording !== null ? (
              <Card className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <StatusPill intent={session.recording.isPublished ? "success" : "warning"}>
                    {session.recording.isPublished ? "Visible to students" : "Held back"}
                  </StatusPill>
                  <Chip>{session.recording.provider.toLowerCase()}</Chip>
                </div>
                <a
                  href={session.recording.url}
                  className="text-body text-gold underline-offset-4 hover:underline"
                >
                  {session.recording.title ?? session.recording.url}
                </a>
              </Card>
            ) : delivered ? (
              <Card>
                <RecordingForm sessionId={session.sessionId} />
              </Card>
            ) : (
              /* Not an empty state to fill in — the session has not happened,
                 so there is nothing yet to record. */
              <Card>
                <EmptyState
                  title="Nothing to record yet"
                  description="Mark the session delivered and the recording can be attached. A link on a session still to be taught is a promise the system cannot keep."
                />
              </Card>
            )}
          </PageSection>

          <PageSection
            title={`Assignments${session.assignments.length === 0 ? "" : ` — ${formatCount(session.assignments.length)}`}`}
            description="Set against a delivered session. Completion is what releases them."
          >
            {session.assignments.length === 0 ? (
              <Card>
                <EmptyState
                  title={delivered ? "No assignments yet" : "Not available until delivered"}
                  description={
                    delivered
                      ? "Nothing has been set against this session."
                      : "A session must be marked delivered before assignments can be set against it."
                  }
                />
              </Card>
            ) : (
              <Card padding="none" className="overflow-hidden">
                <ul className="flex flex-col">
                  {session.assignments.map((assignment) => (
                    <li
                      key={assignment.assignmentId}
                      className="flex flex-wrap items-center gap-4 border-b border-hairline p-4 last:border-b-0"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-body font-semibold text-ink">
                          {assignment.title}
                        </span>
                        <span className="block font-mono text-caption text-ink-subtle">
                          {assignment.assignmentCode}
                          {assignment.dueAt === null ? "" : ` · due ${assignment.dueAt.slice(0, 10)}`}
                        </span>
                      </span>
                      <StatusPill intent={assignment.status === "OPEN" ? "success" : "neutral"}>
                        {assignment.status.toLowerCase()}
                      </StatusPill>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </PageSection>
        </div>
      </div>

      <p className="text-body-sm text-ink-muted">
        <Link
          href={`/batches/${session.batchId}`}
          className="text-gold underline-offset-4 hover:underline"
        >
          Back to the batch
        </Link>
      </p>
    </PageBody>
  );
}
