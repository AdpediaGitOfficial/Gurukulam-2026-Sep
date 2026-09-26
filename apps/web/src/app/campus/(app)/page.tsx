import type { Metadata } from "next";

import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { SessionLine } from "@/features/campus/components/session-line";
import {
  CampusCard,
  CampusHighlight,
  CampusPage,
  CampusStat,
} from "@/features/campus/components/campus-page";
import { getDashboard } from "@/features/campus/server/campus-service";
import { requireCollegeUser } from "@/server/principal";
import { rupees } from "@/lib/money";

export const metadata: Metadata = { title: "Overview — Gurukulam" };

/**
 * How the engagement is going.
 *
 * ── Why this is not the operator's dashboard with a filter ─────────────
 *
 * It very nearly was: `GET /dashboard` applies `collegeScope` to every figure
 * derived from a row, and the response even echoes the scope it was computed
 * under. Driving it as a real college user is what showed the rest — 191
 * trainers, the size of the question bank, the whole course catalogue, the
 * bench-to-stretched utilisation spread, the trainers carrying the most
 * delivery by name, and an operator queue of sessions missing recordings. None
 * of those is derived from a scoped row, so scope had nothing to filter them by.
 *
 * ── Why "with Gurukulam" is a state and not a number to chase ──────────
 *
 * Half of what a college can see is OUR queue. A requirement they raised and we
 * have not answered is not their backlog, and colouring it as work would be a
 * reproach for something they already did.
 */
export default async function CampusOverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  /* Guarded here as well as in the layout: they render concurrently, so the
     layout's redirect does not stop this page calling the API with the wrong
     actor's token. */
  await requireCollegeUser();

  const [dashboard, query] = await Promise.all([getDashboard(), searchParams]);
  const waiting = dashboard.requirementsWithUs + dashboard.submissionsWithUs;

  return (
    <CampusPage
      eyebrow="Overview"
      title="Your engagement"
      description={
        waiting === 0
          ? "Where your cohorts stand, and what the institution owes."
          : "Where your cohorts stand — and what is with us."
      }
    >
      {query["password"] === "changed" ? (
        <Alert intent="success" title="Password changed">
          Use the new one next time you sign in.
        </Alert>
      ) : null}

      {dashboard.nextSession === null ? (
        <CampusCard>
          <EmptyState
            title="Nothing scheduled yet"
            description="When a session is timetabled for one of your cohorts it appears here, with the room and who is teaching it."
          />
        </CampusCard>
      ) : (
        <CampusHighlight>
          <p className="mb-3 text-overline text-on-campus uppercase">Next on campus</p>
          <SessionLine session={dashboard.nextSession} />
        </CampusHighlight>
      )}

      <CampusCard title="Your students" action={{ href: "/campus/students", label: "All students" }}>
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          <CampusStat label="Enrolled" value={dashboard.studentsEnrolled} href="/campus/students" />
          <CampusStat
            label="Not on a cohort"
            value={dashboard.studentsNotOnACohort}
            caption="Yours to place"
            intent={dashboard.studentsNotOnACohort > 0 ? "danger" : "neutral"}
            {...(dashboard.studentsNotOnACohort > 0 ? { href: "/campus/students" } : {})}
          />
          <CampusStat label="Cohorts running" value={dashboard.batchesRunning} href="/campus/schedule" />
          <CampusStat
            label="Sessions this week"
            value={dashboard.sessionsThisWeek}
            href="/campus/schedule"
          />
        </div>
      </CampusCard>

      <CampusCard title="With Gurukulam">
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-3">
          <CampusStat
            label="Requests open"
            value={dashboard.requirementsWithUs}
            caption="We answer these"
            intent={dashboard.requirementsWithUs > 0 ? "waiting" : "neutral"}
            href="/campus/requirements"
          />
          <CampusStat
            label="Name lists under review"
            value={dashboard.submissionsWithUs}
            caption="We check each name"
            intent={dashboard.submissionsWithUs > 0 ? "waiting" : "neutral"}
            href="/campus/certificates"
          />
          <CampusStat
            label="Certificates issued"
            value={dashboard.certificatesReady}
            caption="Yours to hand out"
            intent={dashboard.certificatesReady > 0 ? "success" : "neutral"}
            href="/campus/certificates"
          />
        </div>
      </CampusCard>

      {/* Money last, and only as a summary. A bursar reconciles on the billing
          screen; a TPO reading this one needs to know whether anything is late,
          not the schedule it is late against. */}
      <CampusCard title="Billing" action={{ href: "/campus/billing", label: "Contracts and dues" }}>
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          <CampusStat label="Billed" value={rupees(dashboard.billing.billedMinor)} />
          <CampusStat label="Paid" value={rupees(dashboard.billing.paidMinor)} intent="success" />
          <CampusStat label="Outstanding" value={rupees(dashboard.billing.outstandingMinor)} />
          <CampusStat
            label="Overdue"
            value={rupees(dashboard.billing.overdueMinor)}
            intent={dashboard.billing.overdueMinor === "0" ? "neutral" : "danger"}
            href="/campus/billing"
          />
        </div>
      </CampusCard>
    </CampusPage>
  );
}
