import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/empty-state";
import { PortalCard, PortalPage, PortalStat } from "@/features/me/components/portal-page";
import { SessionCard } from "@/features/me/components/session-card";
import { getHome } from "@/features/me/server/me-service";
import { requireStudent } from "@/server/principal";

export const metadata: Metadata = { title: "Home — Gurukulam" };

/**
 * The landing page.
 *
 * A student has no fleet to survey, so this is not a dashboard of metrics. It
 * answers the question they opened the portal with — when is my next class —
 * in the one highlighted card above the fold, then says where they stand.
 *
 * The design also shows Money and an updates feed here. Both need endpoints
 * that do not exist yet — a student fee view and an `emit()` beside the
 * notification sweep — and they arrive with those, rather than as cards
 * rendering zeroes that read as facts.
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
    <PortalPage
      eyebrow="Home"
      title={`Hello, ${home.firstName}`}
      description="Your next session, and where you stand on the batches you are enrolled on."
    >
      {home.nextSession === null ? (
        <PortalCard>
          <EmptyState
            title="Nothing scheduled"
            description="When your trainer schedules the next class it appears here, with the room or the joining link."
          />
        </PortalCard>
      ) : (
        <SessionCard session={home.nextSession} highlight />
      )}

      <PortalCard title="Where you stand" action={{ href: "/portal/learning", label: "All sessions" }}>
        {/* Two across even on the narrowest phone: four figures stacked is a
            column of scrolling where the mock reads them at a glance, and each
            is short enough to pair. */}
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          <PortalStat label="Batches running" value={home.activeBatches} />
          <PortalStat label="Batches finished" value={home.completedBatches} />
          <PortalStat label="Sessions delivered" value={home.deliveredSessions} />
          <PortalStat
            label="Recordings"
            value={home.availableRecordings}
            caption="Published, on a delivered session"
          />
        </div>

        <p className="mt-5 border-t border-hairline pt-4 text-body-sm text-ink-muted">
          {home.activeBatches > 0
            ? `You are on ${home.activeBatches === 1 ? "one batch" : `${home.activeBatches} batches`}.`
            : home.completedBatches > 0
              ? /* A finished enrolment can still have a session ahead of it, so
                   this never says "you are not on a batch" above a card that
                   names one — a correct page reading as a broken one. */
                `You have finished ${home.completedBatches === 1 ? "one batch" : `${home.completedBatches} batches`}.`
              : "You are not on a batch yet."}
        </p>
      </PortalCard>
    </PortalPage>
  );
}
