import type { Metadata } from "next";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { SessionCard } from "@/features/me/components/session-card";
import { getHome } from "@/features/me/server/me-service";
import { requireStudent } from "@/server/principal";

export const metadata: Metadata = { title: "Home — Gurukulam" };

/**
 * The landing page.
 *
 * A student has no fleet to survey, so this is not a dashboard of metrics. It
 * answers the question they actually opened the portal with — when is my next
 * class — above the fold, and then says what they are on and what they can
 * catch up on.
 */
export default async function StudentHomePage() {
  /* Guarded here as well as in the layout, and for the reason `server/api.ts`
     records about expired sessions: a layout and its page render CONCURRENTLY,
     so the layout redirecting does not stop this page from calling `/me/*`
     with an administrator's token. That call is refused, and the refusal wins
     the race — a correct redirect surfaces as a 500. The console guards in
     both places for the same reason. */
  await requireStudent();

  const home = await getHome();

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-h1 text-ink">Hello, {home.firstName}</h1>
        {/* Three cases, because two of them read as a contradiction if they
            are collapsed: a student whose enrolment is COMPLETE can still have
            a session ahead of them, and "you are not on a running batch"
            printed directly above that session is how a correct page looks
            broken. */}
        <p className="text-body-sm text-ink-muted">
          {home.activeBatches > 0
            ? `You are on ${home.activeBatches === 1 ? "one batch" : `${home.activeBatches} batches`}.`
            : home.completedBatches > 0
              ? `You have finished ${home.completedBatches === 1 ? "one batch" : `${home.completedBatches} batches`}.`
              : "You are not on a batch yet."}
        </p>
      </header>

      <section aria-labelledby="next-session" className="flex flex-col gap-3">
        <h2 id="next-session" className="text-h2 text-ink">
          Your next session
        </h2>
        {home.nextSession === null ? (
          <Card>
            <EmptyState
              title="Nothing scheduled"
              description="When your trainer schedules the next class it appears here, with the room or the joining link."
            />
          </Card>
        ) : (
          <SessionCard session={home.nextSession} />
        )}
      </section>

      <section aria-labelledby="where-you-are" className="flex flex-col gap-3">
        <h2 id="where-you-are" className="text-h2 text-ink">
          Where you are
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Tile label="Batches running" value={home.activeBatches} />
          <Tile label="Batches finished" value={home.completedBatches} />
          <Tile label="Sessions delivered" value={home.deliveredSessions} />
          <Tile
            label="Recordings to watch"
            value={home.availableRecordings}
            caption="Published, on a delivered session"
          />
        </div>
        <div>
          <Link href="/portal/learning" className={buttonVariants({ variant: "secondary" })}>
            Open my learning
          </Link>
        </div>
      </section>
    </div>
  );
}

/** A count, at metric scale. The label says what it counts; nothing is inferred. */
function Tile({ label, value, caption }: { label: string; value: number; caption?: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-body-sm text-ink-muted">{label}</span>
      <span className="text-metric-sm tabular-nums text-ink">{value}</span>
      {caption === undefined ? null : (
        <span className="text-caption text-ink-subtle">{caption}</span>
      )}
    </Card>
  );
}
