import type { Metadata } from "next";
import type { MeAssignment } from "@gurukulam/contracts";

import { EmptyState } from "@/components/ui/empty-state";
import { AssignmentCard } from "@/features/me/components/assignment-card";
import { PortalCard, PortalPage } from "@/features/me/components/portal-page";
import { getAssignments } from "@/features/me/server/me-service";
import { requireStudent } from "@/server/principal";

export const metadata: Metadata = { title: "Assignments — Gurukulam" };

/**
 * The work set against this student's batches.
 *
 * ── Why three sections and not one sorted list ──────────────────────────
 *
 * A single list ordered by date reads every assignment in the same voice, and
 * the one thing a student needs from this screen is which of them still wants
 * something from them. Outstanding leads and is the only part carrying a verb;
 * what is handed in is reassurance; what closed unanswered is history they can
 * still ask about.
 *
 * The split is the API's, so the home card and this page cannot drift on what
 * "handed in" means.
 *
 * ── Why closed work is still here ───────────────────────────────────────
 *
 * Closing stops submission; it does not erase what was asked. A list that
 * quietly shortened would leave a student unable to tell "I did everything"
 * from "I never saw it" — and unable to ask about a mark that never arrived.
 */
export default async function MyAssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ "handed-in"?: string }>;
}) {
  /* Guarded here as well as in the layout — see the note on the home page. */
  await requireStudent();

  const [assignments, params] = await Promise.all([getAssignments(), searchParams]);
  // Named rather than generic: with several cards on screen, a banner that does
  // not say WHICH one went in is a banner that has to be taken on trust.
  const justHandedIn = params["handed-in"];

  const total =
    assignments.outstanding.length + assignments.submitted.length + assignments.missed.length;

  return (
    <PortalPage
      eyebrow="Assignments"
      title="My assignments"
      description="What your trainers have set, what you have handed in, and what is still to do."
    >
      {total === 0 ? (
        <PortalCard>
          <EmptyState
            title="Nothing set yet"
            description="When a trainer sets work against one of your sessions it appears here, with the date it is due."
          />
        </PortalCard>
      ) : (
        <>
          <Section
            id="outstanding"
            title="To do"
            empty="Nothing outstanding — everything set so far is in."
            assignments={assignments.outstanding}
            justHandedIn={justHandedIn}
          />
          <Section
            id="submitted"
            title="Handed in"
            assignments={assignments.submitted}
            justHandedIn={justHandedIn}
          />
          <Section
            id="missed"
            title="Closed without a submission"
            assignments={assignments.missed}
            justHandedIn={justHandedIn}
          />
        </>
      )}
    </PortalPage>
  );
}

/**
 * One band of the list.
 *
 * A section with nothing in it is omitted rather than rendered empty — except
 * "To do", whose emptiness is the good news this screen exists to deliver.
 */
function Section({
  id,
  title,
  empty,
  assignments,
  justHandedIn,
}: {
  id: string;
  title: string;
  empty?: string;
  assignments: MeAssignment[];
  justHandedIn: string | undefined;
}) {
  if (assignments.length === 0 && empty === undefined) return null;

  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-4">
      <h2 id={id} className="text-h2 text-ink">
        {title}
        {assignments.length === 0 ? "" : ` (${assignments.length})`}
      </h2>

      {assignments.length === 0 ? (
        <PortalCard>
          <p className="text-body-sm text-ink-muted">{empty}</p>
        </PortalCard>
      ) : (
        <ul className="flex flex-col gap-4">
          {assignments.map((assignment) => (
            <li key={assignment.assignmentId}>
              <AssignmentCard
                assignment={assignment}
                confirmed={assignment.assignmentId === justHandedIn}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
