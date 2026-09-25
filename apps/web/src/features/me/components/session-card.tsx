import type { MeSession } from "@gurukulam/contracts";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { StatusPill } from "@/components/ui/status-pill";
import { PortalCard, PortalHighlight } from "@/features/me/components/portal-page";
import { portalDate, portalDay } from "@/features/me/format";
import { cn } from "@/lib/cn";

const MODE = { ONLINE: "Online", OFFLINE: "In person", HYBRID: "Hybrid" } as const;

/** Online is a link, in person is a place. The icon says which before the words do. */
const MODE_ICON: Record<MeSession["mode"], IconName> = {
  ONLINE: "globe",
  OFFLINE: "college",
  HYBRID: "globe",
};

/**
 * One session, as a student reads it.
 *
 * ── Two shapes, one card ────────────────────────────────────────────────
 *
 * `highlight` is the next class: tinted, edged, with the verbs that act on it.
 * Everything else is an ordinary panel in a list. They share this component
 * because they are the same facts — a student who learned to read one should
 * not have to learn the other.
 *
 * ── Why a cancelled one is not just labelled ────────────────────────────
 *
 * Left looking ordinary it is something a student plans around and turns up
 * for. The time is struck through and the reason carries the weight: "the
 * trainer was ill" is what they need, and a gap with no explanation is what
 * generates the call to the office.
 *
 * ── Why "not yet marked delivered" is said out loud ─────────────────────
 *
 * A session whose date has passed and which nobody has marked complete is a
 * real state here — recordings and assignments both hang off that act.
 * Rendering it as though it had happened makes a missing recording look like a
 * bug; saying so makes it a question with an answer.
 */
export function SessionCard({
  session,
  past = false,
  highlight = false,
}: {
  session: MeSession;
  past?: boolean;
  highlight?: boolean;
}) {
  const cancelled = session.status === "CANCELLED";
  const awaitingCompletion = past && session.status !== "COMPLETED" && !cancelled;
  const Shell = highlight ? PortalHighlight : PortalCard;

  return (
    <Shell>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span
              className={cn(
                "text-h2 text-ink",
                cancelled && "text-ink-subtle line-through",
              )}
            >
              {portalDay(session.scheduledDate)}
            </span>
            {highlight && !cancelled ? (
              <span className="text-body-sm font-medium text-gold">{whenPhrase(session.scheduledDate)}</span>
            ) : null}
          </p>
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
          <p className="text-caption text-ink-subtle">
            {session.courseName ?? "—"} · {session.batchCode}
          </p>
        </div>

        {/* The three things a person needs to actually turn up. */}
        <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Meta icon="clock">
            {session.startTime} – {session.endTime}
          </Meta>
          <Meta icon={MODE_ICON[session.mode]}>
            {MODE[session.mode]}
            {session.venue === null ? "" : ` · ${session.venue}`}
          </Meta>
          {session.trainerName === null ? null : <Meta icon="acct">{session.trainerName}</Meta>}
        </ul>

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
            className="flex w-fit items-center gap-2 text-body-sm font-medium text-brand underline-offset-4 hover:underline"
          >
            <Icon name="play" size={18} />
            Watch the recording
          </a>
        ) : session.status === "COMPLETED" ? (
          <p className="text-body-sm text-ink-subtle">No recording for this session.</p>
        ) : awaitingCompletion ? (
          <p className="text-body-sm text-ink-subtle">
            Not yet marked delivered — the recording appears once it is.
          </p>
        ) : null}

        {/* Only the highlighted card carries verbs: a list of twelve sessions
            each offering to be joined is twelve invitations to the wrong one. */}
        {highlight && !cancelled ? (
          <div className="mt-1 flex flex-wrap items-center gap-3">
            {session.meetingLink === null ? null : (
              <a href={session.meetingLink} className={buttonVariants({ variant: "primary" })}>
                Join the session
              </a>
            )}
            <Link href="/portal/learning" className={buttonVariants({ variant: "secondary" })}>
              See the full schedule
            </Link>
          </div>
        ) : null}
      </div>
    </Shell>
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

/**
 * "in 2 days", and never "in 0 days".
 *
 * Counted in whole days from today rather than in hours from now, because a
 * class at 10:00 tomorrow is tomorrow's class all evening — an hours-based
 * count would call it "in 14 hours" and then "in 2 hours", which is a
 * different and more anxious fact than the one a schedule is stating.
 */
function whenPhrase(scheduledDate: string): string {
  const today = new Date();
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const when = new Date(`${scheduledDate}T00:00:00.000Z`).getTime();
  const days = Math.round((when - start) / 86_400_000);

  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}
