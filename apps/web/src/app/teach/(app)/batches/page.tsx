import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { TeachCard, TeachPage } from "@/features/teach/components/teach-page";
import { teachDate } from "@/features/teach/format";
import { listMyBatches } from "@/features/teach/server/teach-service";
import { requireTrainer } from "@/server/principal";

export const metadata: Metadata = { title: "Batches — Gurukulam" };

/**
 * The cohorts they teach.
 *
 * ── Why this list is short, and why that is the point ──────────────────
 *
 * It is scoped by the API, not filtered here: a trainer asking `/batches` gets
 * the cohorts they are primary trainer of or hold a live confirmed assignment
 * to, decided by the same fragment every other trainer read uses. An admin
 * asking the same endpoint sees every batch in the estate.
 *
 * ── What is not on it ──────────────────────────────────────────────────
 *
 * Nothing commercial. The batch contract carries no money at all — pricing
 * lives on a ledger or a contract, neither of which a trainer can reach — so
 * there is no projection here to get wrong.
 */
export default async function TrainerBatchesPage() {
  /* Guarded here as well as in the layout — see the dashboard. */
  await requireTrainer();

  const batches = await listMyBatches();

  return (
    <TeachPage
      eyebrow="Batches"
      title="Your cohorts"
      description="The groups you are confirmed to teach."
    >
      {batches.length === 0 ? (
        <TeachCard>
          <EmptyState
            title="No cohorts yet"
            description="A batch appears here once you are confirmed on it. Invitations you have not answered are under Invitations."
          />
        </TeachCard>
      ) : (
        <ul className="flex flex-col gap-4">
          {batches.map((batch) => (
            <li key={batch.batchId}>
              <TeachCard>
                <div className="flex min-w-0 flex-col gap-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="min-w-0">
                      <span className="text-body font-semibold break-words text-ink">
                        {batch.courseName ?? batch.name}
                      </span>
                      <span className="block font-mono text-caption text-ink-subtle">
                        {batch.batchCode}
                      </span>
                    </span>
                    <StatusPill
                      intent={
                        batch.status === "COMPLETED"
                          ? "success"
                          : batch.status === "CANCELLED"
                            ? "danger"
                            : "info"
                      }
                    >
                      {batch.status.toLowerCase().replace("_", " ")}
                    </StatusPill>
                  </div>

                  <p className="text-body-sm text-ink-muted">
                    {teachDate(batch.startDate)}
                    {batch.endDate === null ? "" : ` – ${teachDate(batch.endDate)}`}
                    {batch.enrolledCount === undefined
                      ? ""
                      : ` · ${batch.enrolledCount} ${batch.enrolledCount === 1 ? "student" : "students"}`}
                  </p>

                  <Link
                    href="/teach/sessions"
                    className="w-fit text-body-sm font-medium text-brand underline-offset-4 hover:underline"
                  >
                    See its sessions
                  </Link>
                </div>
              </TeachCard>
            </li>
          ))}
        </ul>
      )}
    </TeachPage>
  );
}
