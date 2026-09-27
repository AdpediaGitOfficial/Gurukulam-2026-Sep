import type { ReactNode } from "react";

import { TrainerShell } from "@/components/layout/trainer-shell";
import { getInvitations, getTrainer } from "@/features/teach/server/teach-service";
import { requireTrainer } from "@/server/principal";

/**
 * Every signed-in trainer route renders inside this.
 *
 * `requireTrainer` rather than `requirePrincipal`: a student who followed a
 * trainer link goes to their own portal and an administrator to their console,
 * rather than being shown a shell whose every screen will refuse them. The API
 * refuses them too — this is the half that makes the refusal readable.
 */
export default async function TrainerPortalLayout({ children }: { children: ReactNode }) {
  await requireTrainer();

  /* Both in parallel: the shell needs the engagement to decide whether
     Invitations exists at all, and the count to badge it. */
  const [trainer, invitations] = await Promise.all([getTrainer(), getInvitations()]);

  return (
    <TrainerShell trainer={trainer} invitations={invitations.length}>
      {children}
    </TrainerShell>
  );
}
