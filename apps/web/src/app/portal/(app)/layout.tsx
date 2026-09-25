import type { ReactNode } from "react";

import { StudentShell } from "@/components/layout/student-shell";
import { getProfile } from "@/features/me/server/me-service";
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
  const me = await getProfile();

  return (
    <StudentShell principal={principal} segment={me.segment}>
      {children}
    </StudentShell>
  );
}
