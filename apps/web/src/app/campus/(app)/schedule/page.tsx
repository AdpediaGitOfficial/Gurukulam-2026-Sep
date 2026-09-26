import type { Metadata } from "next";

import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { CampusCard, CampusPage } from "@/features/campus/components/campus-page";
import { SessionLine } from "@/features/campus/components/session-line";
import { campusDate } from "@/features/campus/format";
import { listBatches, listSessions } from "@/features/campus/server/campus-service";
import { requireCollegeUser } from "@/server/principal";

export const metadata: Metadata = { title: "Schedule — Gurukulam" };

/**
 * The campus schedule: every cohort of theirs, and every day in it.
 *
 * ── Why cohorts and sessions are one screen here ───────────────────────
 *
 * The trainer portal keeps Batches and Sessions apart, because a trainer works
 * across cohorts and asks "what still needs a register" — a question that cuts
 * across them. A college asks the opposite: "when is OUR group taught, and by
 * whom". Grouping the days under the cohort they belong to answers that in one
 * read, and a separate Batches screen would be a list of five things you then
 * have to click.
 *
 * ── What is absent ─────────────────────────────────────────────────────
 *
 * Attendance, and the register. Those are the trainer's to write and ours to
 * override; a college reading who turned up on Tuesday is a conversation to have
 * with the office rather than a screen — and the attendance floor a certificate
 * depends on is reported on the certificates screen, where it decides something.
 */
export default async function CampusSchedulePage() {
  await requireCollegeUser();
  const [batches, sessions] = await Promise.all([listBatches(), listSessions()]);

  const byBatch = new Map<string, typeof sessions>();
  for (const session of sessions) {
    const list = byBatch.get(session.batchId) ?? [];
    list.push(session);
    byBatch.set(session.batchId, list);
  }

  // Running cohorts first, finished ones after: the schedule is a forward-looking
  // screen, and last term's dates are history rather than plans.
  const ordered = [...batches].sort((a, b) => {
    const live = (status: string): number =>
      status === "IN_PROGRESS" ? 0 : status === "SCHEDULED" ? 1 : 2;
    return live(a.status) - live(b.status) || b.startDate.localeCompare(a.startDate);
  });

  return (
    <CampusPage
      eyebrow="Schedule"
      title="Your cohorts"
      description="Each group we are running for you, and when it is taught."
    >
      {ordered.length === 0 ? (
        <CampusCard>
          <EmptyState
            title="No cohorts yet"
            description="Once a requirement is confirmed we open a dedicated cohort for it, and its sessions appear here with the room and the trainer."
          />
        </CampusCard>
      ) : (
        ordered.map((batch) => {
          const days = byBatch.get(batch.batchId) ?? [];
          return (
            <CampusCard key={batch.batchId}>
              <div className="mb-4 flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <h2 className="text-h3 break-words text-ink">{batch.name}</h2>
                  <p className="font-mono text-caption text-ink-subtle">
                    {batch.batchCode}
                    {batch.courseName === null || batch.courseName === undefined
                      ? ""
                      : ` · ${batch.courseName}`}
                  </p>
                </div>
                <StatusPill
                  intent={
                    batch.status === "COMPLETED"
                      ? "success"
                      : batch.status === "IN_PROGRESS"
                        ? "info"
                        : "neutral"
                  }
                >
                  {batch.status.replace(/_/g, " ").toLowerCase()}
                </StatusPill>
              </div>

              <p className="mb-4 text-body-sm text-ink-muted">
                {batch.enrolledCount ?? 0} of your students
                {" · "}
                starts {campusDate(batch.startDate)}
                {batch.endDate === null ? "" : ` · ends ${campusDate(batch.endDate)}`}
              </p>

              {days.length === 0 ? (
                <p className="text-body-sm text-ink-subtle">
                  The timetable for this cohort is not out yet.
                </p>
              ) : (
                <div className="flex flex-col divide-y divide-hairline">
                  {days.map((session) => (
                    <SessionLine key={session.sessionId} session={session} />
                  ))}
                </div>
              )}
            </CampusCard>
          );
        })
      )}
    </CampusPage>
  );
}
