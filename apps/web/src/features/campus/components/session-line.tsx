import type { BatchSession } from "@gurukulam/contracts";

import { Icon, type IconName } from "@/components/ui/icon";
import { StatusPill } from "@/components/ui/status-pill";
import { campusDay } from "@/features/campus/format";
import { cn } from "@/lib/cn";

const MODE: Record<string, string> = { ONLINE: "Online", OFFLINE: "On campus", HYBRID: "Hybrid" };
const MODE_ICON: Record<string, IconName> = { ONLINE: "globe", OFFLINE: "college", HYBRID: "globe" };

/**
 * One session, as the institution reads it.
 *
 * ── Why this is not a link ─────────────────────────────────────────────
 *
 * The trainer's session row links to the screen where they mark the register;
 * the student's links to the work. A college has nothing to DO with a single
 * session — they are reading the schedule, so a link would be a click that
 * lands on a page with no verb.
 *
 * ── What it carries that the trainer's does not ────────────────────────
 *
 * The room and the trainer's NAME, because "who is teaching our students on
 * Tuesday, and where" is the question a TPO is asked in a corridor. What we pay
 * that trainer is ours, and no field of theirs but the name reaches this.
 */
export function SessionLine({ session }: { session: BatchSession }) {
  const cancelled = session.status === "CANCELLED";

  return (
    <div className="flex min-w-0 flex-col gap-1.5 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className={cn("text-h3 text-ink", cancelled && "text-ink-subtle line-through")}>
            {campusDay(session.scheduledDate)}
          </span>
          <span className="text-body-sm text-ink-muted tabular-nums">
            {session.startTime}–{session.endTime}
          </span>
        </span>
        {cancelled ? (
          <StatusPill intent="danger">cancelled</StatusPill>
        ) : session.status === "COMPLETED" ? (
          <StatusPill intent="success">delivered</StatusPill>
        ) : (
          <StatusPill intent="info">scheduled</StatusPill>
        )}
      </div>

      <div className="min-w-0">
        <p className="text-body font-semibold break-words text-ink">{session.title}</p>
        <p className="font-mono text-caption text-ink-subtle">
          {session.batchCode ?? ""} · {session.sessionCode}
        </p>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-body-sm text-ink-muted">
        <span className="flex items-center gap-1.5">
          <Icon name={MODE_ICON[session.mode] ?? "college"} size={16} />
          {MODE[session.mode] ?? session.mode}
        </span>
        {session.venue === null ? null : <span className="min-w-0 break-words">{session.venue}</span>}
        {session.trainerName === null || session.trainerName === undefined ? null : (
          <span className="min-w-0 break-words">Taught by {session.trainerName}</span>
        )}
      </div>

      {/* A cancellation with no reason is the thing that generates the phone
          call this portal exists to prevent. */}
      {cancelled && session.cancelReason ? (
        <p className="text-body-sm text-danger">{session.cancelReason}</p>
      ) : null}
    </div>
  );
}
