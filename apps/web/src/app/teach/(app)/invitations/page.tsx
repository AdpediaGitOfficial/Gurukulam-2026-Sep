import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { InvitationVerbs } from "@/features/teach/components/invitation-verbs";
import { TeachCard, TeachPage } from "@/features/teach/components/teach-page";
import { teachDate } from "@/features/teach/format";
import { getInvitations, getTrainer } from "@/features/teach/server/teach-service";
import { requireTrainer } from "@/server/principal";

export const metadata: Metadata = { title: "Invitations — Gurukulam" };

/**
 * Batches proposed to this trainer.
 *
 * ── Why an in-house trainer never gets here ────────────────────────────
 *
 * They are staff, not a counterparty: their assignment is created CONFIRMED
 * the moment they are allocated, so there is never anything to accept. The nav
 * entry is absent for them, and typing the URL redirects rather than showing
 * an empty screen that reads as "nothing has been offered yet" when the truth
 * is that nothing ever will be. Same shape, same reason, as Fees being absent
 * for a college student.
 *
 * ── Why the answer is theirs alone ─────────────────────────────────────
 *
 * `respondToProposal` was written for an ADMIN recording the trainer's answer
 * on their behalf, and nothing asked who was confirming because nothing but an
 * admin ever called it. It asserts the proposal is the caller's own now.
 */
export default async function TrainerInvitationsPage() {
  /* Guarded here as well as in the layout — see the dashboard. */
  await requireTrainer();

  const [trainer, invitations] = await Promise.all([getTrainer(), getInvitations()]);
  if (trainer.engagement === "IN_HOUSE") redirect("/teach");

  return (
    <TeachPage
      eyebrow="Invitations"
      title="Batches proposed to you"
      description="Accepting one puts the cohort in your diary and makes its sessions yours."
    >
      {invitations.length === 0 ? (
        <TeachCard>
          <EmptyState
            title="Nothing proposed"
            description="When the office puts a cohort forward it appears here, with its dates and how many students are on it."
          />
        </TeachCard>
      ) : (
        <ul className="flex flex-col gap-4">
          {invitations.map((invitation) => (
            <li key={invitation.assignmentId}>
              <TeachCard>
                <div className="flex min-w-0 flex-col gap-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="min-w-0">
                      <span className="text-body font-semibold break-words text-ink">
                        {invitation.courseName ?? invitation.batchName}
                      </span>
                      <span className="block font-mono text-caption text-ink-subtle">
                        {invitation.batchCode}
                      </span>
                    </span>
                    <span className="text-caption text-ink-subtle">
                      Proposed {teachDate(invitation.proposedAt)}
                    </span>
                  </div>

                  {/* The four facts somebody decides on: when, where, how big,
                      and how much of their diary it takes. */}
                  <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    <Meta icon="cal">
                      {teachDate(invitation.startDate)}
                      {invitation.endDate === null ? "" : ` – ${teachDate(invitation.endDate)}`}
                    </Meta>
                    <Meta icon="clock">
                      {invitation.sessionCount}{" "}
                      {invitation.sessionCount === 1 ? "session" : "sessions"}
                    </Meta>
                    <Meta icon="users">
                      {invitation.rosterSize}{" "}
                      {invitation.rosterSize === 1 ? "student" : "students"}
                    </Meta>
                    <Meta icon={invitation.mode === "ONLINE" ? "globe" : "college"}>
                      {invitation.mode === "ONLINE" ? "Online" : (invitation.venue ?? invitation.cityName ?? "In person")}
                    </Meta>
                  </ul>

                  <InvitationVerbs
                    batchId={invitation.batchId}
                    batchCode={invitation.batchCode}
                    disabled={trainer.suspended}
                  />
                </div>
              </TeachCard>
            </li>
          ))}
        </ul>
      )}
    </TeachPage>
  );
}

function Meta({ icon, children }: { icon: "cal" | "clock" | "users" | "globe" | "college"; children: React.ReactNode }) {
  return (
    <li className="flex min-w-0 items-center gap-1.5 text-body-sm text-ink-muted">
      <Icon name={icon} size={16} className="shrink-0 text-ink-subtle" />
      <span className="min-w-0 break-words">{children}</span>
    </li>
  );
}
