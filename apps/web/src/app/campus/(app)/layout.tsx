import type { ReactNode } from "react";

import { CampusShell } from "@/components/layout/campus-shell";
import { getCollege, getDashboard } from "@/features/campus/server/campus-service";
import { requireCollegeUser } from "@/server/principal";

/**
 * Every signed-in college route renders inside this.
 *
 * `requireCollegeUser` rather than `requirePrincipal`: a student, a trainer or
 * an administrator who followed a college link is sent to their own surface
 * instead of a shell whose every screen will refuse them. The API refuses them
 * too — this is the half that makes the refusal readable.
 *
 * And the guard is repeated on each page, not only here: layouts and pages
 * render concurrently, so this redirect does not stop the page beneath it
 * calling `/me/college` with the wrong actor's token, and that refusal would win
 * the race and surface as a 500 on a correct redirect.
 */
export default async function CollegePortalLayout({ children }: { children: ReactNode }) {
  await requireCollegeUser();

  /* Both in parallel: the shell needs the institution for its identity block
     and the count of requirements still with us to badge the nav. */
  const [college, dashboard] = await Promise.all([getCollege(), getDashboard()]);

  return (
    <CampusShell college={college} withUs={dashboard.requirementsWithUs}>
      {children}
    </CampusShell>
  );
}
