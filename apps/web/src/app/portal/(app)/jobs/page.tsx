import type { Metadata } from "next";

import { EmptyState } from "@/components/ui/empty-state";
import { JobCard } from "@/features/me/components/job-card";
import { PortalCard, PortalPage } from "@/features/me/components/portal-page";
import { getJobs } from "@/features/me/server/me-service";
import { requireStudent } from "@/server/principal";

export const metadata: Metadata = { title: "Jobs — Gurukulam" };

/**
 * The openings this student matches.
 *
 * ── Why this is not a job board ─────────────────────────────────────────
 *
 * Every posting here was targeted at an audience, and this student is in it.
 * The page says so, once, and each card says which rule put it there. A feed
 * that looked like a noticeboard would be read like one — skimmed and closed —
 * and the student would have no way to tell a listing meant for them from one
 * that went to everybody.
 *
 * ── Why an empty list is not a failure ──────────────────────────────────
 *
 * It is the ordinary state for most students most of the time, and it has a
 * cause worth naming: nothing currently posted matches their course yet. An
 * empty page with no sentence reads as a page that did not load.
 */
export default async function MyJobsPage() {
  /* Guarded here as well as in the layout — see the note on the home page. */
  await requireStudent();

  const jobs = await getJobs();

  return (
    <PortalPage
      eyebrow="Jobs"
      title="Openings you match"
      description="You see a posting because you fit its audience — matched on your course, your batch and when you finish — not because everyone sees it."
    >
      {jobs.length === 0 ? (
        <PortalCard>
          <EmptyState
            title="Nothing matching you yet"
            description="Postings are targeted by course, batch and passout year. When one is posted for yours it appears here — there is nothing to sign up for."
          />
        </PortalCard>
      ) : (
        <>
          <ul className="flex flex-col gap-4">
            {jobs.map((job) => (
              <li key={job.jobPostingId}>
                <JobCard job={job} />
              </li>
            ))}
          </ul>

          {/* Said plainly rather than left to be discovered. A student who
              applied through a listing would otherwise reasonably expect the
              office to know, and be surprised later that nobody did. */}
          <p className="text-body-sm text-ink-subtle">
            Applying happens on the employer's own listing, so we do not see it. Tell the office if
            you want them to know you have applied.
          </p>
        </>
      )}
    </PortalPage>
  );
}
