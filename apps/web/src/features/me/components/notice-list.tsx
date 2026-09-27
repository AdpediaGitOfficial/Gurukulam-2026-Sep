import type { MeNotice } from "@gurukulam/contracts";
import Link from "next/link";

import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

/** What each class is actually saying, before any colour is involved. */
const SKIN: Record<
  MeNotice["class"],
  { icon: IconName; tile: string; label: string }
> = {
  ACTION_REQUIRED: { icon: "task", tile: "bg-warning/15 text-warning-strong", label: "To do" },
  ALERT: { icon: "warn", tile: "bg-danger/10 text-danger", label: "Important" },
  FYI: { icon: "bell", tile: "bg-surface-muted text-ink-muted", label: "Update" },
};

/**
 * The feed.
 *
 * ── Why unread is a left edge and not a colour ──────────────────────────
 *
 * The class already spends the colour — red for something that happened to
 * you, amber for something to do — and unread is a second, orthogonal fact. An
 * unread FYI tinted like an alert would say the wrong thing twice. A weight
 * change and an edge say "new" without competing with what the row is about.
 *
 * ── Why a resolved notice never appears here ────────────────────────────
 *
 * The API drops them. A swept row whose condition has cleared — the work was
 * handed in, the session is no longer tomorrow — has nothing left to say, and
 * leaving it would make the list a history of things that stopped being true.
 */
export function NoticeList({ notices }: { notices: MeNotice[] }) {
  return (
    <ul className="flex min-w-0 flex-col gap-3">
      {notices.map((notice) => (
        <li key={notice.notificationId}>
          <Notice notice={notice} />
        </li>
      ))}
    </ul>
  );
}

function Notice({ notice }: { notice: MeNotice }) {
  const skin = SKIN[notice.class];

  return (
    <article
      className={cn(
        "flex min-w-0 gap-3 rounded-card border border-hairline bg-surface p-4",
        // Unread leads with an edge; read rows recede rather than disappear.
        notice.read ? "opacity-80" : "border-l-4 border-l-accent",
      )}
    >
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-tile", skin.tile)}>
        <Icon name={skin.icon} size={18} />
      </span>

      <div className="flex min-w-0 flex-col gap-1">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span
            className={cn(
              "min-w-0 text-body break-words text-ink",
              notice.read ? "" : "font-semibold",
            )}
          >
            {notice.title}
          </span>
          {/* The class said in words as well as in colour: this is read on a
              phone, in a corridor, sometimes by somebody colour-blind. */}
          <span className="text-overline text-ink-subtle uppercase">{skin.label}</span>
        </p>

        {notice.body === null ? null : (
          <p className="text-body-sm break-words text-ink-muted">{notice.body}</p>
        )}

        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <time className="text-caption text-ink-subtle" dateTime={notice.createdAt}>
            {whenPhrase(notice.createdAt)}
          </time>
          {notice.ctaHref === null ? null : (
            <Link
              href={notice.ctaHref}
              className="text-body-sm font-medium text-brand underline-offset-4 hover:underline"
            >
              {notice.ctaLabel ?? "Open it"}
            </Link>
          )}
        </p>
      </div>
    </article>
  );
}

/**
 * "2 hours ago", and never "in -3 minutes".
 *
 * A notice is read in relation to now, not as a timestamp: "your Tuesday class
 * was cancelled" matters completely differently if it arrived ten minutes ago
 * or last month. Past a week the relative form stops helping and the date is
 * what a person would actually quote, so it switches.
 */
function whenPhrase(iso: string): string {
  const then = new Date(iso);
  const minutes = Math.floor((Date.now() - then.getTime()) / 60_000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`;

  return then.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
