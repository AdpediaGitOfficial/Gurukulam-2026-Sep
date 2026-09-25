import type { Metadata } from "next";
import type { MeBatch } from "@gurukulam/contracts";

import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { SessionCard } from "@/features/me/components/session-card";
import { portalDate } from "@/features/me/format";
import { getSchedule, listBatches } from "@/features/me/server/me-service";
import { requireStudent } from "@/server/principal";

export const metadata: Metadata = { title: "My learning — Gurukulam" };

const MODE = { ONLINE: "Online", OFFLINE: "In person", HYBRID: "Hybrid" } as const;

/**
 * The portal's reason to exist.
 *
 * ── Why upcoming and past are split by the server ───────────────────────
 *
 * A student's first question is "when is my next class". Answering it by
 * handing the page one long array and filtering in the component would put the
 * answer wherever the list happened to fall; the split arrives already made.
 *
 * ── Why a finished batch still appears ──────────────────────────────────
 *
 * The batch they completed is how they explain the certificate they hold, and
 * a roster they left is part of their own history. Only an enrolment an admin
 * removed outright — they should never have been on it — disappears.
 */
export default async function MyLearningPage() {
  /* Guarded here as well as in the layout, and for the reason `server/api.ts`
     records about expired sessions: a layout and its page render CONCURRENTLY,
     so the layout redirecting does not stop this page from calling `/me/*`
     with an administrator's token. That call is refused, and the refusal wins
     the race — a correct redirect surfaces as a 500. The console guards in
     both places for the same reason. */
  await requireStudent();

  const [batches, schedule] = await Promise.all([listBatches(), getSchedule()]);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-h1 text-ink">My learning</h1>
        <p className="text-body-sm text-ink-muted">
          Your batches and every session on them, with recordings once a session has been
          delivered.
        </p>
      </header>

      <section aria-labelledby="batches" className="flex flex-col gap-3">
        <h2 id="batches" className="text-h2 text-ink">
          My batches
        </h2>
        {batches.length === 0 ? (
          <Card>
            <EmptyState
              title="Not on a batch yet"
              description="Once the office allocates you to one, it appears here with its full schedule."
            />
          </Card>
        ) : (
          <ul className="flex flex-col gap-4">
            {batches.map((batch) => (
              <li key={batch.batchId}>
                <BatchCard batch={batch} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="upcoming" className="flex flex-col gap-3">
        <h2 id="upcoming" className="text-h2 text-ink">
          Coming up
        </h2>
        {schedule.upcoming.length === 0 ? (
          <Card>
            <EmptyState
              title="Nothing scheduled"
              description="No sessions ahead of today on any of your batches."
            />
          </Card>
        ) : (
          <ul className="flex flex-col gap-4">
            {schedule.upcoming.map((session) => (
              <li key={session.sessionId}>
                <SessionCard session={session} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="past" className="flex flex-col gap-3">
        <h2 id="past" className="text-h2 text-ink">
          Already happened
        </h2>
        {schedule.past.length === 0 ? (
          <Card>
            <EmptyState
              title="Nothing yet"
              description="Sessions move here the day after they were scheduled."
            />
          </Card>
        ) : (
          <ul className="flex flex-col gap-4">
            {schedule.past.map((session) => (
              <li key={session.sessionId}>
                <SessionCard session={session} past />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function BatchCard({ batch }: { batch: MeBatch }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-body font-semibold text-ink">{batch.courseName ?? batch.name}</p>
          <p className="font-mono text-caption text-ink-subtle">{batch.batchCode}</p>
        </div>
        {/* The STUDENT's outcome on this batch, not the batch's own status — a
            batch can finish with somebody who left halfway still on its
            roster, and those are different facts about different people. */}
        {batch.outcome === "COMPLETED" ? (
          <StatusPill intent="success">completed</StatusPill>
        ) : batch.outcome === "LEFT" ? (
          <StatusPill intent="neutral">left</StatusPill>
        ) : (
          <StatusPill intent="info">running</StatusPill>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Chip variant="outline">{MODE[batch.mode]}</Chip>
        {batch.trainerName === null ? (
          <Chip variant="outline">Trainer to be confirmed</Chip>
        ) : (
          <Chip variant="outline">{batch.trainerName}</Chip>
        )}
        {batch.venue === null ? null : <Chip variant="outline">{batch.venue}</Chip>}
      </div>

      <p className="text-body-sm text-ink-muted">
        Started {portalDate(batch.startDate)} ·{" "}
        {batch.sessionCount === 0
          ? "no sessions scheduled yet"
          : `${batch.deliveredCount} of ${batch.sessionCount} sessions delivered`}
      </p>
    </Card>
  );
}
