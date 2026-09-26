import type { Metadata } from "next";
import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import { StatusPill } from "@/components/ui/status-pill";
import { MarkForm } from "@/features/teach/components/mark-form";
import { RegisterForm } from "@/features/teach/components/register-form";
import { TeachCard, TeachPage } from "@/features/teach/components/teach-page";
import { teachDay } from "@/features/teach/format";
import { getAttendance, listSessionSubmissions } from "@/features/teach/server/teach-service";
import { requireTrainer } from "@/server/principal";

export const metadata: Metadata = { title: "Session — Gurukulam" };

/**
 * One session, and the register that belongs to it.
 *
 * ── Why attendance is here and not a section of its own ────────────────
 *
 * Attendance belongs to a session, not to a trainer. It is reached in the
 * moment it is taken — standing in the room — and a top-level Attendance entry
 * would be the sessions list with a second purpose.
 *
 * ── Why marking is on this screen too ──────────────────────────────────
 *
 * The register and the work handed in are the two things a session leaves
 * behind, and a trainer does both on the day. The dashboard has counted
 * "waiting to be marked" since it was built and linked here — to a screen with
 * no way to mark: `gradeSubmission` was a server action nothing called, and the
 * work itself (`content_text`) reached no contract but the student's own, so
 * there was nothing to put on the screen even if it had existed.
 *
 * ── Why a read-only register still renders ─────────────────────────────
 *
 * A trainer released from the batch, or looking at a colleague's session, can
 * see what was recorded and cannot change it. Hiding it would lose the history
 * they are entitled to; disabling the form without saying why would read as a
 * bug. `editable` arrives decided by the API and the screen says which it is.
 */
export default async function TrainerSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  /* Guarded here as well as in the layout — see the dashboard. */
  await requireTrainer();

  const { sessionId } = await params;
  /* Both in parallel: the page needs the register and the work before it can
     render either, so serialising them costs a request of latency for nothing. */
  const [attendance, submissions] = await Promise.all([
    getAttendance(sessionId),
    listSessionSubmissions(sessionId),
  ]);
  const cancelled = attendance.sessionStatus === "CANCELLED";
  // Handed in and not yet marked. `gradedAt` rather than the status, because the
  // status is what the grade WRITES and this is the question before it.
  const toMark = submissions.filter((submission) => submission.gradedAt === null).length;

  return (
    <TeachPage
      eyebrow={attendance.sessionCode}
      title={attendance.sessionTitle}
      description={`${teachDay(attendance.scheduledDate)} · ${attendance.batchCode}`}
    >
      <TeachCard>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {cancelled ? (
            <StatusPill intent="danger">cancelled</StatusPill>
          ) : attendance.sessionStatus === "COMPLETED" ? (
            <StatusPill intent="success">delivered</StatusPill>
          ) : (
            <StatusPill intent="info">scheduled</StatusPill>
          )}
          <Link
            href="/teach/sessions"
            className="text-body-sm font-medium text-brand underline-offset-4 hover:underline"
          >
            All sessions
          </Link>
        </div>
      </TeachCard>

      <section aria-labelledby="register" className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="register" className="text-h2 text-ink">
            Register
          </h2>
          {/* Never taken is a different fact from everybody absent, and the
              certificate floor turns on the difference. */}
          <p className="text-body-sm text-ink-muted">
            {attendance.takenAt === null
              ? "Not taken yet"
              : `${attendance.present + attendance.late} of ${attendance.rows.length} attended`}
          </p>
        </div>

        <TeachCard>
          {attendance.rows.length === 0 ? (
            <p className="text-body-sm text-ink-muted">
              Nobody is on this batch&rsquo;s roster yet, so there is no register to take.
            </p>
          ) : cancelled ? (
            <p className="flex items-start gap-2 text-body-sm text-ink-muted">
              <Icon name="warn" size={18} className="mt-0.5 shrink-0 text-danger" />
              <span>
                This session was cancelled, so there is no register. Nobody attended, and a row
                saying absent would count against them at the attendance floor.
              </span>
            </p>
          ) : attendance.editable ? (
            <RegisterForm attendance={attendance} />
          ) : (
            <ReadOnlyRegister attendance={attendance} />
          )}
        </TeachCard>
      </section>

      {/* ── Marking ──────────────────────────────────────────────────────────
          Beside the register, because they are the two things a session leaves
          behind and a trainer does both on the day. The dashboard has counted
          "waiting to be marked" since it was built and linked to a screen with
          no way to mark: `gradeSubmission` existed as a server action that
          nothing called. */}
      {submissions.length === 0 ? null : (
        <section aria-labelledby="marking" className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="marking" className="text-h2 text-ink">
              Handed in
            </h2>
            <p className="text-body-sm text-ink-muted">
              {toMark === 0
                ? `${submissions.length} marked`
                : `${toMark} of ${submissions.length} still to mark`}
            </p>
          </div>

          <TeachCard>
            <ul className="flex min-w-0 flex-col">
              {submissions.map((submission) => (
                <MarkForm
                  key={submission.submissionId}
                  submission={submission}
                  editable={attendance.editable}
                />
              ))}
            </ul>
          </TeachCard>
        </section>
      )}
    </TeachPage>
  );
}

/**
 * What was recorded, without the means to change it.
 *
 * Reached by a trainer who no longer holds the batch, or who did not teach
 * this particular day. Both keep the history — they are entitled to see what
 * they or a colleague wrote — and neither may add to it.
 */
function ReadOnlyRegister({
  attendance,
}: {
  attendance: Awaited<ReturnType<typeof getAttendance>>;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <p className="rounded-well bg-surface-soft p-3 text-body-sm text-ink">
        {attendance.takenAt === null
          ? "This register has not been taken, and it is not yours to take — either the day was somebody else's to teach, or you are no longer on this batch."
          : "You can see this register and not change it — either the day was somebody else's to teach, or you are no longer on this batch."}
      </p>

      {attendance.takenAt === null ? null : (
        <ul className="flex flex-col divide-y divide-hairline">
          {attendance.rows.map((row) => (
            <li
              key={row.studentId}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 first:pt-0"
            >
              <span className="min-w-0">
                <span className="text-body break-words text-ink">{row.studentName}</span>
                <span className="block font-mono text-caption text-ink-subtle">
                  {row.studentCode}
                </span>
              </span>
              <span className="text-body-sm text-ink-muted">
                {row.status === null ? "not marked" : row.status.toLowerCase()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
