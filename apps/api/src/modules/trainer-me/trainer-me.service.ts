import { Injectable } from "@nestjs/common";
import type {
  MeInvitation,
  MeTrainer,
  MeTrainerDashboard,
  Principal,
} from "@gurukulam/contracts";
import { PrismaService } from "../prisma/prisma.module";
import { ApiException } from "../../common/errors";

/**
 * What is genuinely about the trainer themselves.
 *
 * Everything about a COHORT — batches, sessions, rosters, attendance, grading
 * — goes through the shared services with `trainerScope` applied inside them,
 * because a trainer writes rows the admin console writes too and those must be
 * one code path. This file is the remainder: who they are, what is waiting for
 * them, and the invitations that are theirs to answer.
 *
 * Every query here is anchored to `principal.id`. There is no trainer id
 * parameter anywhere, so the scope is structural rather than checked.
 */
@Injectable()
export class TrainerMeService {
  constructor(private readonly prisma: PrismaService) {}

  async profile(principal: Principal): Promise<MeTrainer> {
    const trainer = await this.prisma.trainer.findFirst({
      where: { trainerId: principal.id, deletedAt: null },
      include: {
        courses: {
          where: { deletedAt: null },
          include: { course: { select: { courseId: true, name: true } } },
        },
      },
    });
    if (!trainer) throw ApiException.notFound("Trainer");

    return {
      trainerId: trainer.trainerId,
      trainerCode: trainer.trainerCode,
      name: trainer.name,
      email: trainer.email,
      loginEmail: trainer.loginEmail,
      phone: trainer.phone,
      engagement: trainer.engagement,
      maxWeeklyHours: trainer.maxWeeklyHours,
      approvedCourses: trainer.courses.map((c) => ({
        courseId: c.course.courseId,
        name: c.course.name,
      })),
      suspended: trainer.accountStatus === "SUSPENDED",
      // Theirs to read, because it is about them — and because a portal that
      // silently refuses every write is one somebody reports as broken.
      suspendedReason: trainer.suspendedReason,
    };
  }

  /**
   * How delivery is going.
   *
   * ── Why "registers outstanding" is here and hours taught is not ────────
   *
   * Every figure on this screen is something a trainer can do something about.
   * A delivered session with no register is work left undone that nothing else
   * will chase — the operator sweep raises "completed sessions without a
   * recording" but has never been able to raise this one, because until now
   * nothing wrote attendance at all.
   */
  async dashboard(principal: Principal): Promise<MeTrainerDashboard> {
    const me = principal.id;
    const today = startOfToday();

    const mine = {
      deletedAt: null,
      OR: [
        { primaryTrainerId: me },
        { trainerAssignments: { some: { trainerId: me, status: "CONFIRMED" as const, deletedAt: null } } },
      ],
    };

    const [batches, mySessions, invitations] = await Promise.all([
      this.prisma.batch.findMany({
        where: { ...mine, status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
        select: {
          batchId: true,
          batchCode: true,
          course: { select: { name: true, attendanceFloorPct: true } },
        },
      }),
      this.prisma.batchSession.findMany({
        where: { deletedAt: null, trainerId: me },
        include: SESSION_SHAPE,
        orderBy: [{ scheduledDate: "asc" }, { startTime: "asc" }],
      }),
      this.prisma.batchTrainerAssignment.count({
        where: { trainerId: me, status: "PROPOSED", deletedAt: null },
      }),
    ]);

    const delivered = mySessions.filter((s) => s.status === "COMPLETED");
    const upcoming = mySessions.filter(
      (s) => s.scheduledDate >= today && s.status !== "COMPLETED" && s.status !== "CANCELLED",
    );

    /*
     * A delivered session with no register at all.
     *
     * Counted by the ABSENCE of rows rather than by a flag, for the same
     * reason `eligibility.service.ts` distinguishes absent from unmarked: a
     * session where everybody was away still has rows, and it is not
     * outstanding.
     */
    const registersOutstanding = delivered.filter((s) => s._count.attendance === 0).length;

    const awaitingMarking = await this.prisma.assignmentSubmission.count({
      where: {
        deletedAt: null,
        submittedAt: { not: null },
        gradedAt: null,
        assignment: { deletedAt: null, session: { trainerId: me, deletedAt: null } },
      },
    });

    return {
      nextSession: upcoming[0] ? toSession(upcoming[0]) : null,
      batchesRunning: batches.length,
      sessionsDelivered: delivered.length,
      sessionsUpcoming: upcoming.length,
      registersOutstanding,
      awaitingMarking,
      invitations,
      belowFloor: await this.belowFloor(batches),
    };
  }

  /**
   * Which cohorts are below their course's attendance floor.
   *
   * ── The figure this product has never been able to show ────────────────
   *
   * `courses.attendance_floor_pct` has been on every course since the first
   * migration and could never be evaluated, because nothing wrote attendance.
   * A batch with no register at all is NOT reported as below its floor — that
   * is the register being outstanding, which the figure above counts, and
   * reporting it here would put a cohort on a warning list for their trainer's
   * omission rather than their own.
   */
  private async belowFloor(
    batches: { batchId: string; batchCode: string; course: { name: string; attendanceFloorPct: number | null } }[],
  ) {
    const warnings = [];

    for (const batch of batches) {
      const floor = batch.course.attendanceFloorPct;
      if (floor === null) continue;

      const [sessions, roster] = await Promise.all([
        this.prisma.batchSession.findMany({
          where: { batchId: batch.batchId, deletedAt: null, status: "COMPLETED" },
          select: { sessionId: true },
        }),
        this.prisma.studentBatchMapping.findMany({
          where: { batchId: batch.batchId, deletedAt: null, isActive: true },
          select: { studentId: true },
        }),
      ]);
      if (sessions.length === 0 || roster.length === 0) continue;

      const sessionIds = sessions.map((s) => s.sessionId);
      const marks = await this.prisma.studentAttendance.groupBy({
        by: ["studentId"],
        where: { sessionId: { in: sessionIds }, deletedAt: null, status: { in: ["PRESENT", "LATE"] } },
        _count: { _all: true },
      });
      // No register anywhere on this batch: nothing to judge. See above.
      const anyMarks = await this.prisma.studentAttendance.count({
        where: { sessionId: { in: sessionIds }, deletedAt: null },
      });
      if (anyMarks === 0) continue;

      const attended = new Map(marks.map((m) => [m.studentId, m._count._all]));
      const studentsBelow = roster.filter(
        (r) => ((attended.get(r.studentId) ?? 0) / sessions.length) * 100 < floor,
      ).length;

      if (studentsBelow > 0) {
        warnings.push({
          batchId: batch.batchId,
          batchCode: batch.batchCode,
          courseName: batch.course.name,
          floorPct: floor,
          studentsBelow,
          rosterSize: roster.length,
        });
      }
    }

    return warnings;
  }

  /**
   * Batches proposed to this trainer.
   *
   * Always empty for an in-house trainer — their assignment is created
   * CONFIRMED the moment they are allocated, because they are staff rather
   * than a counterparty. The portal hides the entry rather than showing them
   * an empty screen.
   */
  async invitations(principal: Principal): Promise<MeInvitation[]> {
    const rows = await this.prisma.batchTrainerAssignment.findMany({
      where: { trainerId: principal.id, status: "PROPOSED", deletedAt: null },
      include: {
        batch: {
          include: {
            course: { select: { name: true } },
            city: { select: { name: true } },
            _count: {
              select: {
                sessions: { where: { deletedAt: null } },
                studentMappings: { where: { deletedAt: null, isActive: true } },
              },
            },
          },
        },
      },
      orderBy: { proposedAt: "desc" },
    });

    return rows.map((row) => ({
      assignmentId: row.assignmentId,
      batchId: row.batchId,
      batchCode: row.batch.batchCode,
      batchName: row.batch.name,
      courseName: row.batch.course?.name ?? null,
      mode: row.batch.mode,
      venue: row.batch.venue,
      cityName: row.batch.city?.name ?? null,
      startDate: row.batch.startDate.toISOString().slice(0, 10),
      endDate: row.batch.endDate?.toISOString().slice(0, 10) ?? null,
      sessionCount: row.batch._count.sessions,
      rosterSize: row.batch._count.studentMappings,
      proposedAt: row.proposedAt.toISOString(),
    }));
  }
}

const SESSION_SHAPE = {
  batch: { select: { batchCode: true } },
  topic: { select: { title: true } },
  trainer: { select: { name: true } },
  recording: { select: { recordingId: true } },
  _count: { select: { assignments: true, attendance: true } },
} as const;

type SessionRow = {
  sessionId: string; sessionCode: string; batchId: string; topicId: string | null;
  trainerId: string | null; title: string; sequence: number; scheduledDate: Date;
  startTime: Date; endTime: Date; mode: string; venue: string | null;
  meetingLink: string | null; status: string; cancelReason: string | null;
  rescheduledFrom: Date | null; rescheduleReason: string | null; completedAt: Date | null;
  createdAt: Date; deletedAt: Date | null;
  batch: { batchCode: string };
  topic: { title: string } | null;
  trainer: { name: string } | null;
  recording: { recordingId: string } | null;
  _count: { assignments: number; attendance: number };
};

/**
 * The same shape `batchSessionSchema` describes.
 *
 * Written out rather than imported from `sessions.service.ts`, because that
 * mapper takes its own include type and pulling it here would couple this
 * module to the shape of a query it does not make.
 */
function toSession(row: SessionRow) {
  return {
    sessionId: row.sessionId,
    sessionCode: row.sessionCode,
    batchId: row.batchId,
    batchCode: row.batch.batchCode,
    topicId: row.topicId,
    topicTitle: row.topic?.title ?? null,
    trainerId: row.trainerId,
    trainerName: row.trainer?.name ?? null,
    title: row.title,
    sequence: row.sequence,
    scheduledDate: row.scheduledDate.toISOString().slice(0, 10),
    startTime: row.startTime.toISOString().slice(11, 16),
    endTime: row.endTime.toISOString().slice(11, 16),
    mode: row.mode as "ONLINE" | "OFFLINE" | "HYBRID",
    venue: row.venue,
    meetingLink: row.meetingLink,
    status: row.status as "SCHEDULED" | "LIVE" | "COMPLETED" | "CANCELLED",
    cancelReason: row.cancelReason,
    rescheduledFrom: row.rescheduledFrom?.toISOString() ?? null,
    rescheduleReason: row.rescheduleReason,
    completedAt: row.completedAt?.toISOString() ?? null,
    assignmentCount: row._count.assignments,
    hasRecording: row.recording !== null,
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

const startOfToday = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};
