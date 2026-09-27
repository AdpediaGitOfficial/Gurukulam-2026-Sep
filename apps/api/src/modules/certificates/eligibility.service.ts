import { Injectable } from "@nestjs/common";
import type { Eligibility } from "@gurukulam/contracts";
import { PrismaService } from "../prisma/prisma.module";

/**
 * `isEligibleForCertificate`, behind its own service so the rule can change
 * without touching the generator.
 *
 * What defines course completion was left open in admin-portal-plan.md §6, and
 * the recorded assumption is *admin sign-off with an attendance floor*. So
 * nothing here issues anything: it reports what an operator needs to see, and
 * a human decides.
 *
 * Attendance is deferred by request, so a batch may have no attendance rows at
 * all. Reporting that as 0% would block every certificate in the system, so
 * the check says NOT_EVALUATED instead — honest, and it leaves the decision
 * where the assumption puts it.
 */
@Injectable()
export class EligibilityService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluate(studentId: string, batchId: string): Promise<Eligibility> {
    const [mapping, batch, completedSessions] = await Promise.all([
      this.prisma.studentBatchMapping.findFirst({
        where: { studentId, batchId, deletedAt: null },
        select: { mappingId: true },
      }),
      this.prisma.batch.findFirst({
        where: { batchId, deletedAt: null },
        select: { status: true, course: { select: { attendanceFloorPct: true } } },
      }),
      this.prisma.batchSession.findMany({
        where: { batchId, deletedAt: null, status: "COMPLETED" },
        select: { sessionId: true },
      }),
    ]);

    const sessionIds = completedSessions.map((s) => s.sessionId);
    const floor = batch?.course.attendanceFloorPct ?? null;

    const [attendanceForStudent, attendanceForBatch, assignments, submissions] = await Promise.all([
      sessionIds.length
        ? this.prisma.studentAttendance.count({
            where: {
              studentId, deletedAt: null,
              sessionId: { in: sessionIds },
              status: { in: ["PRESENT", "LATE"] },
            },
          })
        : 0,
      // Whether ANYONE's attendance was recorded for this batch. Distinguishes
      // "the student was absent" from "attendance was never taken".
      sessionIds.length
        ? this.prisma.studentAttendance.count({
            where: { deletedAt: null, sessionId: { in: sessionIds } },
          })
        : 0,
      this.prisma.assignment.count({
        where: { batchId, deletedAt: null, status: { in: ["OPEN", "CLOSED"] } },
      }),
      this.prisma.assignmentSubmission.count({
        where: {
          studentId, deletedAt: null,
          status: { in: ["SUBMITTED", "GRADED"] },
          assignment: { batchId, deletedAt: null },
        },
      }),
    ]);

    const attendanceRecorded = attendanceForBatch > 0;
    const attendancePct =
      attendanceRecorded && sessionIds.length > 0
        ? Math.round((attendanceForStudent / sessionIds.length) * 100)
        : null;

    const attendanceCheck: Eligibility["attendanceCheck"] = !attendanceRecorded
      ? "NOT_EVALUATED"
      : floor === null || (attendancePct ?? 0) >= floor
        ? "MET"
        : "BELOW_FLOOR";

    const blockers: string[] = [];
    if (!mapping) blockers.push("The student is not on this batch's roster");
    if (sessionIds.length === 0) blockers.push("No session of this batch has been marked complete");
    if (attendanceCheck === "BELOW_FLOOR") {
      blockers.push(`Attendance is ${attendancePct}%, below the ${floor}% floor for this course`);
    }
    if (batch && batch.status !== "COMPLETED") {
      // Not a hard blocker — an admin may sign off before the batch closes —
      // but the operator should see it.
      blockers.push(`The batch is ${batch.status.toLowerCase()}, not completed`);
    }

    return {
      studentId,
      batchId,
      sessionsCompleted: sessionIds.length,
      sessionsAttended: attendanceForStudent,
      attendancePct,
      attendanceFloorPct: floor,
      attendanceCheck,
      assignmentsTotal: assignments,
      assignmentsSubmitted: submissions,
      onRoster: mapping !== null,
      batchCompleted: batch?.status === "COMPLETED",
      // Roster membership and a completed session are structural; everything
      // else is judgement the operator makes with the figures in front of them.
      eligible: mapping !== null && sessionIds.length > 0 && attendanceCheck !== "BELOW_FLOOR",
      blockers,
    };
  }
}
