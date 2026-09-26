import type { Metadata } from "next";
import type { BatchSession } from "@gurukulam/contracts";

import { EmptyState } from "@/components/ui/empty-state";
import { SessionRow } from "@/features/teach/components/session-row";
import { TeachCard, TeachPage } from "@/features/teach/components/teach-page";
import { listMySessions } from "@/features/teach/server/teach-service";
import { requireTrainer } from "@/server/principal";

export const metadata: Metadata = { title: "Sessions — Gurukulam" };

/**
 * Every session across every cohort, flat.
 *
 * ── Why this exists beside Batches ─────────────────────────────────────
 *
 * "How is this cohort going" is a batch question. "What still needs a
 * register" cuts across batches, and folding it into Batches would make it a
 * filter away on a screen a trainer opens standing in a corridor.
 *
 * ── Why three bands and not a sort ─────────────────────────────────────
 *
 * Today, coming up, delivered. A single list ordered by date puts the thing
 * happening in four hours between last Tuesday and next month, and the whole
 * point of this screen is the first band.
 */
export default async function TrainerSessionsPage() {
  /* Guarded here as well as in the layout — see the dashboard. */
  await requireTrainer();

  const sessions = await listMySessions();
  const today = new Date().toISOString().slice(0, 10);

  const live = sessions.filter(
    (s) => s.scheduledDate === today && s.status !== "COMPLETED" && s.status !== "CANCELLED",
  );
  const ahead = sessions.filter(
    (s) => s.scheduledDate > today && s.status !== "COMPLETED" && s.status !== "CANCELLED",
  );
  // Delivered AND anything past that was never marked complete — the second is
  // the state a register is usually outstanding in, so hiding it would hide
  // the work.
  const behind = sessions
    .filter((s) => s.scheduledDate < today || s.status === "COMPLETED" || s.status === "CANCELLED")
    .reverse();

  return (
    <TeachPage
      eyebrow="Sessions"
      title="Your sessions"
      description="Everything you are down to teach, across every cohort."
    >
      {sessions.length === 0 ? (
        <TeachCard>
          <EmptyState
            title="Nothing in your diary"
            description="Sessions appear here once you are confirmed on a batch and its schedule is set."
          />
        </TeachCard>
      ) : (
        <>
          <Band id="today" title="Today" sessions={live} empty="Nothing today." />
          <Band id="ahead" title="Coming up" sessions={ahead} />
          <Band id="behind" title="Delivered" sessions={behind} />
        </>
      )}
    </TeachPage>
  );
}

/**
 * One band.
 *
 * Omitted when empty, except Today — whose emptiness is a fact a trainer opens
 * this screen to check, and which reads as a broken page if the heading simply
 * is not there.
 */
function Band({
  id,
  title,
  sessions,
  empty,
}: {
  id: string;
  title: string;
  sessions: BatchSession[];
  empty?: string;
}) {
  if (sessions.length === 0 && empty === undefined) return null;

  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-4">
      <h2 id={id} className="text-h2 text-ink">
        {title}
        {sessions.length === 0 ? "" : ` (${sessions.length})`}
      </h2>
      {sessions.length === 0 ? (
        <TeachCard>
          <p className="text-body-sm text-ink-muted">{empty}</p>
        </TeachCard>
      ) : (
        <ul className="flex flex-col gap-4">
          {sessions.map((session) => (
            <li key={session.sessionId}>
              <TeachCard>
                <SessionRow session={session} />
              </TeachCard>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
