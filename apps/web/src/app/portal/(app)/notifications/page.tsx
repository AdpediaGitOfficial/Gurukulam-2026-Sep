import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { NoticeList } from "@/features/me/components/notice-list";
import { PortalCard, PortalPage } from "@/features/me/components/portal-page";
import { markNoticesRead } from "@/features/me/server/actions";
import { getNotifications } from "@/features/me/server/me-service";
import { requireStudent } from "@/server/principal";

export const metadata: Metadata = { title: "Updates — Gurukulam" };

/**
 * What has changed.
 *
 * ── Why this is not the console's bell ──────────────────────────────────
 *
 * That one is an operator WORK QUEUE whose design goal is to reach zero, and
 * whose audience includes every row addressed to nobody in particular. This is
 * a feed of things that happened to one person, most of which they can do
 * nothing about and should simply know.
 *
 * ── Why "Mark all read" does not clear the list ─────────────────────────
 *
 * Reading is not the same as resolving. A cancelled class stays on the screen
 * after it has been read, because it is still true and a student may want to
 * find it again — the row recedes rather than vanishing. The rows that DO
 * disappear are the swept ones, and they disappear when their condition
 * clears: the work is handed in, the session is no longer tomorrow.
 *
 * Action-required rows are untouched by the button for the same reason. A
 * student who could dismiss "work due tomorrow" would have dismissed the one
 * thing on the screen asking them to act — and tonight's sweep would raise it
 * again anyway.
 */
export default async function MyNotificationsPage() {
  /* Guarded here as well as in the layout — see the note on the home page. */
  await requireStudent();

  const { items, badge, unread } = await getNotifications();

  return (
    <PortalPage
      eyebrow="Updates"
      title="What has changed"
      description="Sessions added, moved or cancelled; work set; money due. Everything here is shown in the portal only — nothing is emailed yet."
    >
      {items.length === 0 ? (
        <PortalCard>
          <EmptyState
            title="Nothing to report"
            description="When a session moves, work is set, or a payment falls due, it appears here."
          />
        </PortalCard>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <p className="text-body-sm text-ink-muted">
              {unread === 0
                ? "Nothing unread."
                : `${unread} unread${badge === 0 ? "" : `, ${badge} needing attention`}.`}
            </p>
            {/* Absent rather than disabled when there is nothing to mark. A
                control that does nothing is worse than no control. */}
            {unread === 0 ? null : (
              <form action={markNoticesRead}>
                <Button type="submit" variant="secondary" size="sm">
                  Mark all read
                </Button>
              </form>
            )}
          </div>

          <NoticeList notices={items} />
        </>
      )}
    </PortalPage>
  );
}
