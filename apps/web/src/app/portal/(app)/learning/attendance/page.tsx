import type { Metadata } from "next";
import Link from "next/link";
import type { MeAttendanceBatch } from "@gurukulam/contracts";

import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { AttendanceRow, RegisterFootnotes } from "@/features/me/components/attendance-row";
import { PortalCard, PortalPage, PortalStat } from "@/features/me/components/portal-page";
import { getAttendance } from "@/features/me/server/me-service";
import { requireStudent } from "@/server/principal";

export const metadata: Metadata = { title: "My attendance — Gurukulam" };

/**
 * The figure a certificate turns on, and the days behind it.
 *
 * ── Why this screen exists at all ──────────────────────────────────────
 *
 * `courses.attendance_floor_pct` has been on every course since the first
 * migration, and for most of this product's life nothing could evaluate it
 * because nothing wrote attendance. Now the trainer takes the register, the floor
 * decides whether a certificate can be issued — and until this screen the one
 * person it is used against could not see it. A student refused a certificate
 * for a number they were never shown has no way to have attended more.
 *
 * ── Why it is not a ninth nav entry ────────────────────────────────────
 *
 * `student-shell.tsx` records that eight destinations already overflow a 390px
 * tab bar, and the bell gave way to make room. A ninth would cost another. This
 * sits under Learning, which is the question it answers — how is my course going
 * — and the summary travels to the two screens a student opens anyway: the batch
 * card on Learning, and a warning on Home when they are below the floor.
 */
export default async function MyAttendancePage() {
  /* Guarded here as well as in the layout — they render concurrently, so the
     layout's redirect does not stop this page calling `/me/*` with the wrong
     actor's token, and that refusal would win the race. */
  await requireStudent();

  const attendance = await getAttendance();
  const atRisk = attendance.batches.filter((batch) => batch.attendanceCheck === "BELOW_FLOOR");

  return (
    <PortalPage
      eyebrow="Learning"
      title="My attendance"
      description="Every session that has happened, and whether you were marked there."
    >
      {/* `PortalPage` carries no header action — the student portal's grammar is
          narrower than the other two portals', and widening a shared pattern for
          one screen is how a design system stops meaning anything. A link in the
          flow reads the same and costs nothing. */}
      <Link
        href="/portal/learning"
        className="w-fit text-body-sm font-medium text-brand underline-offset-4 hover:underline"
      >
        Back to my learning
      </Link>

      {atRisk.length === 0 ? (null) : (
        <Alert intent="warning" title="Your attendance is below what the course asks for">
          {atRisk.length === 1
            ? `On ${atRisk[0]?.courseName ?? atRisk[0]?.name}, you are below the ${atRisk[0]?.attendanceFloorPct}% this course asks for. A certificate needs that figure met, so speak to the office — and attend what is left.`
            : `You are below the attendance the course asks for on ${atRisk.length} of your batches. A certificate needs that figure met, so speak to the office.`}
        </Alert>
      )}

      {attendance.batches.length === 0 ? (
        <PortalCard>
          <EmptyState
            title="Not on a batch yet"
            description="Once you are on one, every session that has happened appears here with your attendance."
          />
        </PortalCard>
      ) : (
        attendance.batches.map((batch) => <BatchRegister key={batch.batchId} batch={batch} />)
      )}

      {/* Said once, at the bottom, and only to a student a floor applies to.
          Teaching the rule to somebody it will never be used against is noise. */}
      {attendance.anyFloor ? (
        <p className="text-body-sm text-ink-subtle">
          Attendance is counted against sessions your trainer has marked delivered — not against
          everything on the timetable. Arriving late still counts as attending.
        </p>
      ) : null}
    </PortalPage>
  );
}

function BatchRegister({ batch }: { batch: MeAttendanceBatch }) {
  const below = batch.attendanceCheck === "BELOW_FLOOR";
  const notEvaluated = batch.attendanceCheck === "NOT_EVALUATED";

  return (
    <PortalCard>
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <p className="text-body font-semibold break-words text-ink">
              {batch.courseName ?? batch.name}
            </p>
            <p className="font-mono text-caption text-ink-subtle">{batch.batchCode}</p>
          </div>
          {notEvaluated ? (
            <StatusPill intent="neutral">not counted yet</StatusPill>
          ) : below ? (
            <StatusPill intent="warning">below the floor</StatusPill>
          ) : (
            <StatusPill intent="success">on track</StatusPill>
          )}
        </div>

        {/* ── The figures ─────────────────────────────────────────────────── */}
        {notEvaluated ? (
          /* Not "0%". A register nobody has taken is not a student who attended
             nothing, and that distinction is the whole reason the API sends null
             — `eligibility.service.ts` reports NOT_EVALUATED for the same
             reason, so a certificate is never refused on an untaken register. */
          <p className="text-body-sm text-ink-muted">
            No register has been taken on this batch yet, so there is nothing to count. This is not
            0% — it is a figure that does not exist yet, and nothing about your certificate turns on
            it until it does.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
            <PortalStat
              label="You attended"
              value={`${batch.attendedCount} of ${batch.deliveredCount}`}
              caption="Sessions marked delivered"
            />
            <PortalStat
              label="Your attendance"
              value={`${batch.attendancePct ?? 0}%`}
              intent={below ? "warning" : "success"}
            />
            {batch.attendanceFloorPct === null ? (
              <PortalStat label="This course asks for" value="No minimum" />
            ) : (
              <PortalStat
                label="This course asks for"
                value={`${batch.attendanceFloorPct}%`}
                caption={below ? "You are below it" : "You are meeting it"}
              />
            )}
          </div>
        )}

        {/* ── The days ────────────────────────────────────────────────────── */}
        {batch.sessions.length === 0 ? (
          <p className="text-body-sm text-ink-subtle">
            No session on this batch has happened yet.
          </p>
        ) : (
          <div className="min-w-0">
            <ul className="flex flex-col">
              {batch.sessions.map((row) => (
                <AttendanceRow key={row.sessionId} row={row} />
              ))}
            </ul>
            <RegisterFootnotes rows={batch.sessions} />
          </div>
        )}
      </div>
    </PortalCard>
  );
}
