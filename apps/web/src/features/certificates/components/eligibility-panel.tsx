import type { Eligibility } from "@gurukulam/contracts";

import { Card, CardHeader } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";

/**
 * What the API thinks, laid out so nobody signs off blind.
 *
 * The whole point of this panel is that the blockers are on screen BEFORE the
 * issue button, not returned after it. An operator who overrides is overriding
 * something they read.
 *
 * `NOT_EVALUATED` is shown as its own state rather than folded into a
 * failure. Attendance is deferred, so a batch can legitimately have no rows at
 * all — reporting that as 0% would block every certificate in the system and
 * look like a rule rather than a gap.
 */
export function EligibilityPanel({ eligibility }: { eligibility: Eligibility }) {
  const attendance = ATTENDANCE[eligibility.attendanceCheck];

  return (
    <Card>
      <CardHeader
        as="h2"
        title="Eligibility"
        description="Checked against the roster, the schedule and the work set — not a rubber stamp."
        action={
          <StatusPill intent={eligibility.eligible ? "success" : "warning"}>
            {eligibility.eligible ? "Clear to issue" : "Has blockers"}
          </StatusPill>
        }
      />

      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        <Row
          label="On the roster"
          value={eligibility.onRoster ? "Yes" : "No"}
          bad={!eligibility.onRoster}
        />
        <Row
          label="Batch delivered"
          value={eligibility.batchCompleted ? "Yes" : "Not yet"}
          bad={!eligibility.batchCompleted}
        />
        <Row
          label="Sessions"
          value={`${eligibility.sessionsAttended} attended of ${eligibility.sessionsCompleted} delivered`}
        />
        <Row
          label="Attendance"
          value={
            eligibility.attendancePct === null
              ? attendance.label
              : `${eligibility.attendancePct}%${
                  eligibility.attendanceFloorPct === null
                    ? ""
                    : ` · floor ${eligibility.attendanceFloorPct}%`
                }`
          }
          note={eligibility.attendancePct === null ? attendance.note : undefined}
          bad={eligibility.attendanceCheck === "BELOW_FLOOR"}
        />
        <Row
          label="Assignments"
          value={`${eligibility.assignmentsSubmitted} submitted of ${eligibility.assignmentsTotal} set`}
        />
      </dl>

      {eligibility.blockers.length === 0 ? null : (
        <div className="mt-5 border-t border-hairline pt-5">
          <h3 className="text-body-sm font-semibold text-ink">What is in the way</h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {eligibility.blockers.map((blocker) => (
              <li key={blocker} className="text-body-sm text-danger">
                {blocker}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

const ATTENDANCE = {
  MET: { label: "Met", note: undefined },
  BELOW_FLOOR: { label: "Below the floor", note: undefined },
  NOT_EVALUATED: {
    label: "Not recorded",
    note: "Nothing has been marked for this batch, so this is not a failure — it is an absence of evidence.",
  },
} as const;

function Row({
  label,
  value,
  note,
  bad = false,
}: {
  label: string;
  value: string;
  note?: string | undefined;
  bad?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-caption uppercase tracking-wide text-ink-subtle">{label}</dt>
      <dd className={bad ? "text-body font-semibold text-danger" : "text-body text-ink"}>{value}</dd>
      {note === undefined ? null : (
        <dd className="mt-0.5 text-caption text-ink-muted">{note}</dd>
      )}
    </div>
  );
}
