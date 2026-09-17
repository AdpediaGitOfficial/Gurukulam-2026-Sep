import type { Metadata } from "next";
import { can } from "@gurukulam/contracts";
import Link from "next/link";

import { ConfirmAction, ConfirmWithReason } from "@/components/patterns/confirm-with-reason";
import { DetailRow } from "@/components/patterns/detail-row";
import { PageHeader } from "@/components/patterns/page-header";
import { PageBody, PageSection } from "@/components/patterns/page-section";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { RecordingForm } from "@/features/batches/components/recording-form";
import { RescheduleForm } from "@/features/batches/components/reschedule-form";
import {
  cancelSession,
  completeSession,
  reopenSession,
  unpublishRecording,
} from "@/features/batches/server/actions";
import { getSession } from "@/features/batches/server/batches-service";
import { DeleteRecord } from "@/components/patterns/delete-record";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";
import { formatCount } from "@/lib/format";

export const metadata: Metadata = { title: "Session" };

export default async function SessionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const principal = await requireModule("batches");
  const mayEdit = can(principal, "batches", "edit");
  const mayDelete = can(principal, "batches", "delete");
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
          /* Wraps, because this row now carries four verbs. At 400px they add
             up to 432px and an unwrapped row takes the whole page sideways
             with it — the header's action slot is `shrink-0`, so nothing else
             can absorb the overflow. */
          <div className="flex flex-wrap items-center justify-end gap-3">
            {delivered || session.status === "CANCELLED" ? null : (
              <Link
                href={`/batches/sessions/${session.sessionId}/edit`}
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                Edit
              </Link>
            )}
            {delivered ? (
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
          )}
            {/* Calling it off, which is not deleting it: a cancelled session
                stays in the schedule carrying its reason, because "the trainer
                was ill on the 14th" is delivery history the batch has to be
                able to explain. The API refuses a delivered one, so the verb
                is absent there rather than present and refused. */}
            {mayEdit && !delivered && session.status !== "CANCELLED" ? (
              <ConfirmWithReason
                id={`cancel-${session.sessionId}`}
                subject={session.title}
                action={cancelSession.bind(null, session.sessionId)}
                trigger="Cancel session"
                confirm="Cancel it"
                pending="Cancelling…"
                required
                reasonLabel="Why it was cancelled"
                reasonPlaceholder="Trainer unwell — the topic moves to the next slot"
                reasonHint="Kept on the session and shown beside it."
                description="The session stays in the schedule marked cancelled, so the batch can still explain the gap. Moving it to another day instead is a reschedule."
              />
            ) : null}
            {/* The API refuses a delivered session — that is delivery history,
                and the answer for a future one is Cancel, which tells the
                roster. The verb is still offered so the refusal is readable
                rather than a control nobody can find. */}
            {mayDelete ? (
              <DeleteRecord
                target="session"
                id={session.sessionId}
                label={session.title}
                redirectTo={`/batches/${session.batchId}`}
              />
            ) : null}
          </div>
        }
      />

      {query["saved"] === "1" ? (
        <Alert intent="success" title="Session saved">
          The correction is recorded. Moving it to another day is a reschedule, which tells the roster.
        </Alert>
      ) : query["completed"] === "1" ? (
        <Alert intent="success" title="Marked delivered">
          Assignments can now be set against it, and its recording can be attached.
        </Alert>
      ) : query["reopened"] === "1" ? (
        <Alert intent="info" title="Reopened">
          It counts as scheduled again. Anything already set against it stays.
        </Alert>
      ) : query["cancelled"] === "1" ? (
        <Alert intent="info" title="Session cancelled">
          It stays in the schedule marked cancelled, with the reason beside it.
        </Alert>
      ) : query["moved"] === "1" ? (
        <Alert intent="success" title="Session moved">
          Attendance, assignments and the recording moved with it. The old date is kept on the record.
        </Alert>
      ) : query["unpublished"] === "1" ? (
        <Alert intent="info" title="Recording held back">
          Students can no longer see it. The link is kept, so it can go back up.
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
        {session.status !== "CANCELLED" || session.cancelReason === null || session.cancelReason === undefined ? null : (
          <span className="text-body-sm text-ink-muted">Cancelled — “{session.cancelReason}”</span>
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
            <DetailRow label="Session code" value={<span className="font-mono">{session.sessionCode}</span>} />
            <DetailRow label="Date" value={session.scheduledDate} />
            <DetailRow
              label="Time"
              value={
                <span className="font-mono tabular-nums">
                  {session.startTime}–{session.endTime}
                </span>
              }
            />
            <DetailRow
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
            <DetailRow
              label="Delivered"
              value={session.completedAt === null ? "Not yet" : session.completedAt.slice(0, 10)}
            />
          </dl>
        </Card>

        <div className="flex flex-col gap-8 xl:col-span-2">
          {/* Absent on a delivered session, which the API refuses to move, and
              on a cancelled one, where the honest verb is to schedule a
              replacement rather than resurrect this. */}
          {mayEdit && !delivered && session.status !== "CANCELLED" ? (
            <PageSection
              title="Schedule"
              description="Where and when the cohort is expected. Moving it tells the roster; correcting it on the edit screen does not."
            >
              <Card>
                <RescheduleForm session={session} />
              </Card>
            </PageSection>
          ) : null}

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
                {/* Not a delete: the row and the link stay, so it can go back
                    up once whatever was wrong with it is fixed. There is no
                    republish verb yet — the answer is to relink it — so this
                    says "held back" rather than pretending to a toggle. */}
                {mayEdit && session.recording.isPublished ? (
                  <div className="flex justify-end border-t border-hairline pt-3">
                    <ConfirmAction
                      action={unpublishRecording.bind(null, session.sessionId)}
                      label="Hold it back"
                      pending="Holding…"
                      subject={session.title}
                    />
                  </div>
                ) : null}
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
            action={
              /* Invariant 17 — a session must be delivered before work can be
                 set against it. The control is absent until then rather than
                 present and refused. */
              mayEdit && delivered ? (
                <Link
                  href={`/batches/sessions/${session.sessionId}/assignments/new`}
                  className={buttonVariants({ variant: "secondary", size: "sm" })}
                >
                  Set an assignment
                </Link>
              ) : undefined
            }
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
                      {mayEdit ? (
                        <Link
                          href={`/batches/assignments/${assignment.assignmentId}/edit?sessionId=${session.sessionId}`}
                          className={buttonVariants({ variant: "ghost", size: "sm" })}
                        >
                          Edit
                        </Link>
                      ) : null}
                      {mayDelete ? (
                        <DeleteRecord
                          target="assignment"
                          id={assignment.assignmentId}
                          label={assignment.title}
                        />
                      ) : null}
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
