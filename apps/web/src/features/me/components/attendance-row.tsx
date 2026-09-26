import type { MeAttendanceRow } from "@gurukulam/contracts";

import { Icon, type IconName } from "@/components/ui/icon";
import { portalDay } from "@/features/me/format";
import { cn } from "@/lib/cn";

/**
 * One day on the register, as the student it is about reads it.
 *
 * ── Why "not recorded" is not "absent" ─────────────────────────────────
 *
 * Three silences produce a row with no mark, and only one of them is about the
 * student. The register was taken and they are not on it; no register was taken
 * at all; or the day is not counted because nobody closed the session. All three
 * cost them the same percentage — and saying ABSENT where nobody wrote it is an
 * accusation the product invented. Each says what actually happened, and who to
 * ask.
 */
const MARK: Record<string, { label: string; icon: IconName; tone: string }> = {
  PRESENT: { label: "Present", icon: "check", tone: "text-success-strong" },
  LATE: { label: "Late", icon: "clock", tone: "text-warning-strong" },
  EXCUSED: { label: "Excused", icon: "flag", tone: "text-ink-muted" },
  ABSENT: { label: "Absent", icon: "close", tone: "text-danger" },
};

export function AttendanceRow({ row }: { row: MeAttendanceRow }) {
  const mark = row.status === null ? undefined : MARK[row.status];

  return (
    <li className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-hairline py-3 last:border-b-0">
      <span className="min-w-0">
        <span className="text-body text-ink">{portalDay(row.scheduledDate)}</span>
        <span className="ml-2 text-body-sm text-ink-muted tabular-nums">
          {row.startTime}–{row.endTime}
        </span>
        <span className="block min-w-0 break-words text-body-sm text-ink-muted">{row.title}</span>
      </span>

      <span className="flex shrink-0 items-center gap-1.5">
        {mark !== undefined ? (
          <>
            <Icon name={mark.icon} size={16} className={cn("shrink-0", mark.tone)} />
            <span className={cn("text-body-sm font-medium", mark.tone)}>{mark.label}</span>
          </>
        ) : !row.counted ? (
          /* The session happened and nobody closed it, so it is in nobody's
             figures. Said plainly, because otherwise the denominator looks
             arbitrary to the one person counting the days themselves. */
          <span className="text-body-sm text-ink-subtle">Not counted yet</span>
        ) : row.registerTaken ? (
          <span className="text-body-sm text-ink-subtle">Not recorded for you</span>
        ) : (
          <span className="text-body-sm text-ink-subtle">No register taken</span>
        )}
      </span>
    </li>
  );
}

/** What a row with no mark means, said once under the list rather than per row. */
export function RegisterFootnotes({ rows }: { rows: MeAttendanceRow[] }) {
  const unmarked = rows.some((row) => row.counted && row.status === null && row.registerTaken);
  const untaken = rows.some((row) => row.counted && !row.registerTaken);
  const uncounted = rows.some((row) => !row.counted);

  if (!unmarked && !untaken && !uncounted) return null;

  return (
    <div className="mt-4 flex flex-col gap-2 border-t border-hairline pt-4">
      {unmarked ? (
        <p className="text-body-sm text-ink-muted">
          <span className="font-semibold">Not recorded for you</span> — the register was taken that
          day and your name is not on it. It counts as a session you missed, so if you were there,
          tell the office.
        </p>
      ) : null}
      {untaken ? (
        <p className="text-body-sm text-ink-muted">
          <span className="font-semibold">No register taken</span> — nobody was marked that day. It
          still counts against your total, which is not your doing; the office can have it corrected.
        </p>
      ) : null}
      {uncounted ? (
        <p className="text-body-sm text-ink-muted">
          <span className="font-semibold">Not counted yet</span> — the session has not been closed
          off, so it is in nobody's total. It will be counted once it is.
        </p>
      ) : null}
    </div>
  );
}
