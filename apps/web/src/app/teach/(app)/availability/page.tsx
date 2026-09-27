import type { Metadata } from "next";

import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { LeaveForm } from "@/features/teach/components/leave-form";
import { TeachCard, TeachPage } from "@/features/teach/components/teach-page";
import { teachDate } from "@/features/teach/format";
import { getTrainer, listMyLeave, listMySessions } from "@/features/teach/server/teach-service";
import { requireTrainer } from "@/server/principal";

export const metadata: Metadata = { title: "Availability — Gurukulam" };

/**
 * What they are teaching, and what they have declared away.
 *
 * ── Why this is not a private calendar ─────────────────────────────────
 *
 * `trainer_availability` looks like a personal setting and is not. Free/busy
 * is computed from committed sessions PLUS declared leave, and that
 * computation is what the operations team's trainer picker and clash check
 * read. Declaring leave changes what Ops is allowed to do, which is why the
 * screen says so and why withdrawing it is as significant as declaring it.
 *
 * ── Why a collision is refused rather than created ─────────────────────
 *
 * Leave that covers a session already confirmed is a contradiction, and the
 * API refuses it naming the batch and the date. Quietly accepting would leave
 * a cohort with a trainer who is on leave and nobody would know until the
 * morning of.
 */
export default async function TrainerAvailabilityPage() {
  /* Guarded here as well as in the layout — see the dashboard. */
  await requireTrainer();

  const [trainer, leave, sessions] = await Promise.all([
    getTrainer(),
    listMyLeave(),
    listMySessions(),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const committed = sessions
    .filter((s) => s.scheduledDate >= today && s.status !== "CANCELLED")
    .slice(0, 8);

  return (
    <TeachPage
      eyebrow="Availability"
      title="Your diary"
      description="What you are committed to, and the time you have declared away."
    >
      <TeachCard className="border-teach/30 bg-teach-soft">
        <p className="flex items-start gap-2 text-body-sm text-on-teach">
          <Icon name="bell" size={18} className="mt-0.5 shrink-0" />
          <span>
            Declared leave is not private. The office sees it when they staff a batch, so a day you
            block here is a day they will not propose you for.
          </span>
        </p>
      </TeachCard>

      <section aria-labelledby="committed" className="flex min-w-0 flex-col gap-4">
        <h2 id="committed" className="text-h2 text-ink">
          Committed
        </h2>
        <TeachCard>
          {committed.length === 0 ? (
            <p className="text-body-sm text-ink-muted">Nothing in your diary from today onwards.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-hairline">
              {committed.map((session) => (
                <li
                  key={session.sessionId}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 first:pt-0"
                >
                  <span className="min-w-0">
                    <span className="text-body break-words text-ink">{session.title}</span>
                    <span className="block font-mono text-caption text-ink-subtle">
                      {session.batchCode ?? session.sessionCode}
                    </span>
                  </span>
                  <span className="text-body-sm text-ink-muted tabular-nums">
                    {teachDate(session.scheduledDate)} · {session.startTime}–{session.endTime}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </TeachCard>
      </section>

      <section aria-labelledby="leave" className="flex min-w-0 flex-col gap-4">
        <h2 id="leave" className="text-h2 text-ink">
          Declared away
        </h2>

        {leave.length === 0 ? (
          <TeachCard>
            <EmptyState
              title="Nothing declared"
              description="Block the days you cannot teach and the office will not propose you for them."
            />
          </TeachCard>
        ) : (
          <ul className="flex flex-col gap-3">
            {leave.map((entry) => (
              <li key={entry.availabilityId}>
                <TeachCard>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                    <span className="min-w-0">
                      <span className="text-body font-semibold text-ink tabular-nums">
                        {teachDate(entry.startsAt)}
                        {entry.startsAt.slice(0, 10) === entry.endsAt.slice(0, 10)
                          ? ""
                          : ` – ${teachDate(entry.endsAt)}`}
                      </span>
                      <span className="block text-body-sm break-words text-ink-muted">
                        {entry.type === "LEAVE" ? "Leave" : "Blocked"}
                        {entry.reason === null ? "" : ` · ${entry.reason}`}
                      </span>
                    </span>
                  </div>
                </TeachCard>
              </li>
            ))}
          </ul>
        )}

        {trainer.suspended ? (
          <TeachCard>
            <p className="text-body-sm text-ink-subtle">
              Your account is suspended, so your diary is read-only.
            </p>
          </TeachCard>
        ) : (
          <TeachCard title="Declare time away">
            <LeaveForm />
          </TeachCard>
        )}
      </section>
    </TeachPage>
  );
}
