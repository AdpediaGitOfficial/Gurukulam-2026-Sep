import type { Metadata } from "next";
import type { MeBatch } from "@gurukulam/contracts";

import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { StatusPill } from "@/components/ui/status-pill";
import { PortalCard, PortalPage } from "@/features/me/components/portal-page";
import { SessionCard } from "@/features/me/components/session-card";
import { portalDate } from "@/features/me/format";
import { getSchedule, listBatches } from "@/features/me/server/me-service";
import { requireStudent } from "@/server/principal";

export const metadata: Metadata = { title: "Learning — Gurukulam" };

const MODE = { ONLINE: "Online", OFFLINE: "In person", HYBRID: "Hybrid" } as const;

/**
 * The portal's reason to exist.
 *
 * ── Why upcoming and past are split by the server ───────────────────────
 *
 * A student's first question is when their next class is. Handing the page one
 * long array and filtering in the component would put the answer wherever the
 * list happened to fall; the split arrives already made.
 *
 * ── Why a finished batch still appears ──────────────────────────────────
 *
 * The batch they completed is how they explain the certificate they hold, and
 * a roster they left is part of their own history. Only an enrolment an admin
 * removed outright — they should never have been on it — disappears.
 */
export default async function MyLearningPage() {
  /* Guarded here as well as in the layout — see the note on the home page. */
  await requireStudent();

  const [batches, schedule] = await Promise.all([listBatches(), getSchedule()]);

  return (
    <PortalPage
      eyebrow="Learning"
      title="My learning"
      description="Your batches and every session on them, with recordings once a session has been delivered."
    >
      <section aria-labelledby="batches" className="flex min-w-0 flex-col gap-4">
        <h2 id="batches" className="text-h2 text-ink">
          My batches
        </h2>
        {batches.length === 0 ? (
          <PortalCard>
            <EmptyState
              title="Not on a batch yet"
              description="Once the office allocates you to one, it appears here with its full schedule."
            />
          </PortalCard>
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

      <section aria-labelledby="upcoming" className="flex min-w-0 flex-col gap-4">
        <h2 id="upcoming" className="text-h2 text-ink">
          Coming up
        </h2>
        {schedule.upcoming.length === 0 ? (
          <PortalCard>
            <EmptyState
              title="Nothing scheduled"
              description="No sessions ahead of today on any of your batches."
            />
          </PortalCard>
        ) : (
          <ul className="flex flex-col gap-4">
            {schedule.upcoming.map((session, index) => (
              <li key={session.sessionId}>
                {/* Only the first: the highlight answers "which one is next",
                    and a page of highlights answers nothing. */}
                <SessionCard session={session} highlight={index === 0} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="past" className="flex min-w-0 flex-col gap-4">
        <h2 id="past" className="text-h2 text-ink">
          Already happened
        </h2>
        {schedule.past.length === 0 ? (
          <PortalCard>
            <EmptyState
              title="Nothing yet"
              description="Sessions move here the day after they were scheduled."
            />
          </PortalCard>
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
    </PortalPage>
  );
}

function BatchCard({ batch }: { batch: MeBatch }) {
  const progress =
    batch.sessionCount === 0 ? 0 : Math.round((batch.deliveredCount / batch.sessionCount) * 100);

  return (
    <PortalCard>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <p className="text-body font-semibold break-words text-ink">
              {batch.courseName ?? batch.name}
            </p>
            <p className="font-mono text-caption text-ink-subtle">{batch.batchCode}</p>
          </div>
          {/* The STUDENT's outcome on this batch, not the batch's own status —
              a batch can finish with somebody who left halfway still on its
              roster, and those are different facts about different people. */}
          {batch.outcome === "COMPLETED" ? (
            <StatusPill intent="success">completed</StatusPill>
          ) : batch.outcome === "LEFT" ? (
            <StatusPill intent="neutral">left</StatusPill>
          ) : (
            <StatusPill intent="info">running</StatusPill>
          )}
        </div>

        <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <li className="flex items-center gap-1.5 text-body-sm text-ink-muted">
            <Icon name="cal" size={16} className="shrink-0 text-ink-subtle" />
            Started {portalDate(batch.startDate)}
          </li>
          <li className="flex items-center gap-1.5 text-body-sm text-ink-muted">
            <Icon name="acct" size={16} className="shrink-0 text-ink-subtle" />
            {batch.trainerName ?? "Trainer to be confirmed"}
          </li>
          <li>
            <Chip variant="outline">{MODE[batch.mode]}</Chip>
          </li>
        </ul>

        {batch.sessionCount === 0 ? (
          <p className="text-body-sm text-ink-subtle">No sessions scheduled yet.</p>
        ) : (
          <div className="flex min-w-0 flex-col gap-1.5">
            {/* Delivery, not attendance — this counts what the trainer has
                marked complete, which is the only thing the portal knows. */}
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-surface-muted"
              role="img"
              aria-label={`${batch.deliveredCount} of ${batch.sessionCount} sessions delivered`}
            >
              <div className="h-full rounded-full bg-success" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-body-sm text-ink-muted">
              {batch.deliveredCount} of {batch.sessionCount} sessions delivered
            </p>
          </div>
        )}
      </div>
    </PortalCard>
  );
}
