import type { BatchSession } from "@gurukulam/contracts";
import Link from "next/link";

import { Icon, type IconName } from "@/components/ui/icon";
import { StatusPill } from "@/components/ui/status-pill";
import { teachDay } from "@/features/teach/format";
import { cn } from "@/lib/cn";

const MODE: Record<string, string> = { ONLINE: "Online", OFFLINE: "In person", HYBRID: "Hybrid" };
const MODE_ICON: Record<string, IconName> = { ONLINE: "globe", OFFLINE: "college", HYBRID: "globe" };

/**
 * One session, as the person delivering it reads it.
 *
 * ── What a trainer needs that a student does not ───────────────────────
 *
 * A student's session card answers "where do I go". A trainer's answers that
 * plus "what does this one still need" — the register, the recording, the work
 * — because those are the things nobody else will chase.
 */
export function SessionRow({ session }: { session: BatchSession }) {
  const cancelled = session.status === "CANCELLED";

  return (
    <Link
      href={`/teach/sessions/${session.sessionId}`}
      className="flex min-w-0 flex-col gap-2 rounded-well transition-colors hover:bg-surface-sunken/60"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className={cn("text-h2 text-ink", cancelled && "text-ink-subtle line-through")}>
            {teachDay(session.scheduledDate)}
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

      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Meta icon={MODE_ICON[session.mode] ?? "globe"}>
          {MODE[session.mode] ?? session.mode}
          {session.venue === null ? "" : ` · ${session.venue}`}
        </Meta>
        {session.assignmentCount === 0 ? null : (
          <Meta icon="task">
            {session.assignmentCount} {session.assignmentCount === 1 ? "assignment" : "assignments"}
          </Meta>
        )}
        {session.hasRecording === true ? <Meta icon="play">Recording linked</Meta> : null}
      </ul>
    </Link>
  );
}

function Meta({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <li className="flex min-w-0 items-center gap-1.5 text-body-sm text-ink-muted">
      <Icon name={icon} size={16} className="shrink-0 text-ink-subtle" />
      <span className="min-w-0 break-words">{children}</span>
    </li>
  );
}
