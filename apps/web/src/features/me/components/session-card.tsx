import type { MeSession } from "@gurukulam/contracts";

import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { StatusPill } from "@/components/ui/status-pill";
import { portalDate, portalDay } from "@/features/me/format";

const MODE = { ONLINE: "Online", OFFLINE: "In person", HYBRID: "Hybrid" } as const;

/**
 * One session, as a student reads it.
 *
 * ── Why the whole card changes for a cancelled one ──────────────────────
 *
 * A cancelled session is not a session with a label on it. Left looking
 * ordinary it is something a student plans around and turns up for, so the
 * time is struck through and the reason is given the weight — "the trainer was
 * ill" is the thing they need, and a gap with no explanation is what generates
 * the phone call to the office.
 *
 * ── Why "not yet marked delivered" is said out loud ─────────────────────
 *
 * A session whose date has passed but which nobody has marked complete is a
 * real state in this product — assignments and recordings both hang off that
 * act. Rendering it as though it had happened would make a missing recording
 * look like a bug; saying so makes it a question with an answer.
 */
export function SessionCard({ session, past = false }: { session: MeSession; past?: boolean }) {
  const cancelled = session.status === "CANCELLED";
  const awaitingCompletion = past && session.status !== "COMPLETED" && !cancelled;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-body font-semibold text-ink">{session.title}</p>
          <p className="text-caption text-ink-subtle">
            {session.courseName ?? "—"} · {session.batchCode}
          </p>
        </div>
        {cancelled ? (
          <StatusPill intent="danger">cancelled</StatusPill>
        ) : session.status === "COMPLETED" ? (
          <StatusPill intent="success">delivered</StatusPill>
        ) : (
          <StatusPill intent="info">scheduled</StatusPill>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          className={
            cancelled
              ? "text-body text-ink-subtle line-through"
              : "text-body font-medium text-ink"
          }
        >
          {portalDay(session.scheduledDate)} · {session.startTime}–{session.endTime}
        </span>
        <Chip variant="outline">{MODE[session.mode]}</Chip>
        {session.trainerName === null ? null : (
          <Chip variant="outline">{session.trainerName}</Chip>
        )}
      </div>

      {/* Where to go, or where to click. One or the other, never a blank row. */}
      {cancelled ? null : session.meetingLink !== null ? (
        <a
          href={session.meetingLink}
          className="text-body-sm text-gold underline-offset-4 hover:underline"
        >
          Join the session
        </a>
      ) : session.venue !== null ? (
        <p className="text-body-sm text-ink-muted">{session.venue}</p>
      ) : null}

      {session.rescheduledFrom === null ? null : (
        <p className="text-body-sm text-ink-muted">
          Moved from {portalDate(session.rescheduledFrom)}
        </p>
      )}

      {cancelled && session.cancelReason !== null ? (
        <p className="rounded-well bg-danger/5 p-3 text-body-sm text-danger">
          {session.cancelReason}
        </p>
      ) : null}

      {session.recording !== null ? (
        <a
          href={session.recording.url}
          className="text-body-sm font-medium text-gold underline-offset-4 hover:underline"
        >
          Watch the recording
        </a>
      ) : session.status === "COMPLETED" ? (
        <p className="text-body-sm text-ink-subtle">No recording for this session.</p>
      ) : awaitingCompletion ? (
        <p className="text-body-sm text-ink-subtle">
          Not yet marked delivered — the recording appears once it is.
        </p>
      ) : null}
    </Card>
  );
}
