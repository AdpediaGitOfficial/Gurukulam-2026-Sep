import type { Metadata } from "next";

import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { SessionRow } from "@/features/teach/components/session-row";
import { TeachCard, TeachHighlight, TeachPage, TeachStat } from "@/features/teach/components/teach-page";
import { getDashboard } from "@/features/teach/server/teach-service";
import { requireTrainer } from "@/server/principal";

export const metadata: Metadata = { title: "Dashboard — Gurukulam" };

/**
 * How delivery is going.
 *
 * ── Why every figure here is something to do ───────────────────────────
 *
 * A trainer has one estate and does not need it surveyed. "Hours taught this
 * year" is a fact about the past that changes nothing; "three registers never
 * taken" is work nobody else will chase, and it links straight to it.
 *
 * ── Why the next session leads ─────────────────────────────────────────
 *
 * It is still the first question, the same way it is on a student's home. The
 * figures are context for it.
 */
export default async function TrainerDashboardPage() {
  /* Guarded here as well as in the layout: layouts and pages render
     concurrently, so the layout's redirect does not stop this page calling the
     API with the wrong actor's token — the refusal would win the race and a
     correct redirect would surface as a 500. */
  await requireTrainer();

  const dashboard = await getDashboard();
  const outstanding = dashboard.registersOutstanding + dashboard.awaitingMarking;

  return (
    <TeachPage
      eyebrow="Dashboard"
      title="Your teaching"
      description={
        outstanding === 0
          ? "Nothing is waiting on you."
          : "What is running, and what is waiting on you."
      }
    >
      {dashboard.nextSession === null ? (
        <TeachCard>
          <EmptyState
            title="Nothing scheduled"
            description="When a session is put in your diary it appears here, with the room or the joining link."
          />
        </TeachCard>
      ) : (
        <TeachHighlight>
          <p className="mb-3 text-overline text-on-teach uppercase">Next session</p>
          <SessionRow session={dashboard.nextSession} />
        </TeachHighlight>
      )}

      <TeachCard title="Where delivery stands" action={{ href: "/teach/sessions", label: "All sessions" }}>
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          <TeachStat label="Cohorts running" value={dashboard.batchesRunning} href="/teach/batches" />
          <TeachStat label="Sessions delivered" value={dashboard.sessionsDelivered} />
          <TeachStat
            label="Registers to take"
            value={dashboard.registersOutstanding}
            intent={dashboard.registersOutstanding > 0 ? "danger" : "neutral"}
            caption="Delivered, never marked"
            {...(dashboard.registersOutstanding > 0 ? { href: "/teach/sessions" } : {})}
          />
          <TeachStat
            label="Waiting to be marked"
            value={dashboard.awaitingMarking}
            intent={dashboard.awaitingMarking > 0 ? "danger" : "neutral"}
            caption="Handed in, not graded"
            {...(dashboard.awaitingMarking > 0 ? { href: "/teach/sessions" } : {})}
          />
        </div>
      </TeachCard>

      {/* The figure this product has never been able to show: the attendance
          floor has existed on every course since the first migration and
          nothing wrote a register to evaluate it against. */}
      {dashboard.belowFloor.length === 0 ? null : (
        <TeachCard className="border-warning/30">
          <h2 className="mb-3 flex items-center gap-2 text-h3 text-warning-strong">
            <Icon name="warn" size={20} />
            Below the attendance floor
          </h2>
          <ul className="flex flex-col gap-3">
            {dashboard.belowFloor.map((warning) => (
              <li
                key={warning.batchId}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
              >
                <span className="min-w-0">
                  <span className="text-body font-semibold break-words text-ink">
                    {warning.courseName ?? "A cohort"}
                  </span>
                  <span className="block font-mono text-caption text-ink-subtle">
                    {warning.batchCode}
                  </span>
                </span>
                <span className="text-body-sm text-ink-muted">
                  <span className="font-semibold text-warning-strong tabular-nums">
                    {warning.studentsBelow}
                  </span>{" "}
                  of {warning.rosterSize} below {warning.floorPct}%
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-hairline pt-3 text-body-sm text-ink-muted">
            A student under the floor cannot be issued a certificate. Take the outstanding registers
            first — a session nobody marked counts as nobody attending.
          </p>
        </TeachCard>
      )}
    </TeachPage>
  );
}
