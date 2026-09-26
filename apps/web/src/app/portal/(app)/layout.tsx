import type { ReactNode } from "react";

import { StudentShell } from "@/components/layout/student-shell";
import { getNotifications, getProfile } from "@/features/me/server/me-service";
import { requireStudent } from "@/server/principal";

/**
 * Every signed-in portal route renders inside this.
 *
 * `requireStudent` rather than `requirePrincipal`: an administrator who
 * follows a portal link is sent back to their console instead of being shown
 * a shell whose every screen will refuse them. The API refuses them too — this
 * is the half that makes the refusal readable.
 */
export default async function StudentPortalLayout({ children }: { children: ReactNode }) {
  const principal = await requireStudent();
  /* The nav needs the segment, because Fees is ABSENT for a college student
     rather than empty (invariant 3). One extra read per navigation, in the one
     place that already resolves who is asking. */
  /* Both in parallel: the shell cannot render without either, so serialising
     them would cost a whole request of latency on every navigation. */
  const [me, notifications] = await Promise.all([getProfile(), getNotifications()]);

  return (
    <StudentShell principal={principal} segment={me.segment} badge={notifications.badge}>
      {children}
    </StudentShell>
  );
}
