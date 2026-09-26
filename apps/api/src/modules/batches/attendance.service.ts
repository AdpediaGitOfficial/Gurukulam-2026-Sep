import { Injectable } from "@nestjs/common";
import type {
  MarkAttendanceInput,
  Principal,
  SessionAttendance,
} from "@gurukulam/contracts";
import { PrismaService } from "../prisma/prisma.module";
import { ApiException } from "../../common/errors";
import {
  assertInScope,
  assertOnRoster,
  assertTrainerMayWrite,
  trainerMayWrite,
} from "../../common/scope/scope";

/**
 * Attendance — the write path this product has never had.
 *
 * `student_attendance` has existed since the first migration and nothing has
 * ever written a row. `eligibility.service.ts` reads it and reports
 * NOT_EVALUATED rather than 0% when a batch has none, precisely because
 * nothing did. Every course carries an `attendance_floor_pct` that until now
 * could never be evaluated against anything.
 *
 * ── Why this is a module endpoint and not a trainer-portal feature ──────
 *
 * Both actors need it. The admin console cannot take a register today either,
 * and an operations team needs the override permanently — a trainer who did
 * not mark the class, or marked it wrong, is an ordinary Tuesday. Building it
 * inside the portal would mean writing it twice, and the second copy would
 * disagree about which sessions accept a register.
 *
 * ── The two hops ───────────────────────────────────────────────────────
 *
 * "May this trainer write attendance for this student" is two questions: is
 * this session theirs, and is this student on that session's batch roster.
 * Neither alone is enough, and both are asked below — see `scope.ts`.
 */
@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The register, whether or not it has been taken.
   *
   * Every student on the live roster appears, with `status: null` where no row
   * exists. Absent and unmarked are different facts and the shape keeps them
   * apart — the whole reason eligibility can tell a real 0% from a register
   * nobody took.
   */
  async get(principal: Principal, sessionId: string): Promise<SessionAttendance> {
    const session = await this.loadSession(principal, sessionId);

    const [roster, marks] = await Promise.all([
      this.prisma.studentBatchMapping.findMany({
        where: { batchId: session.batchId, deletedAt: null, isActive: true },
        select: {
          student: { select: { studentId: true, studentCode: true, firstName: true, lastName: true } },
        },
        orderBy: { student: { firstName: "asc" } },
      }),
      this.prisma.studentAttendance.findMany({
        where: { sessionId, deletedAt: null },
      }),
    ]);

    const byStudent = new Map(marks.map((m) => [m.studentId, m]));
    const rows = roster.map(({ student }) => {
      const mark = byStudent.get(student.studentId);
      return {
        studentId: student.studentId,
        studentCode: student.studentCode,
        studentName: [student.firstName, student.lastName].filter(Boolean).join(" "),
        status: mark?.status ?? null,
        minutesPresent: mark?.minutesPresent ?? null,
        remarks: mark?.remarks ?? null,
        markedAt: mark?.markedAt?.toISOString() ?? null,
      };
    });

    const count = (status: string): number => rows.filter((r) => r.status === status).length;
    // The most recent mark, which is when the register was last taken. Null
    // means never — and a caller must not infer that from an empty `rows`,
    // because a batch with no roster also has none.
    const takenAt = marks
      .map((m) => m.markedAt)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0];

    return {
      sessionId: session.sessionId,
      sessionCode: session.sessionCode,
      sessionTitle: session.title,
      batchId: session.batchId,
      batchCode: session.batch.batchCode,
      scheduledDate: session.scheduledDate.toISOString().slice(0, 10),
      sessionStatus: session.status,
      takenAt: takenAt?.toISOString() ?? null,
      editable: trainerMayWrite(principal, session) && this.hasHappened(session),
      rows,
      present: count("PRESENT"),
      absent: count("ABSENT"),
      late: count("LATE"),
      excused: count("EXCUSED"),
    };
  }

  /**
   * Taking the register.
   *
   * ── Why it is an upsert and not an insert ──────────────────────────────
   *
   * A register is corrected — somebody walks in late, or was marked against
   * the wrong name. The partial unique index on (session, student) makes the
   * correction land on the same row rather than creating a second one, so
   * there is never a session with two answers for one student.
   *
   * ── Why a future session is refused ────────────────────────────────────
   *
   * A register for a class that has not happened is not a record of anything.
   * A CANCELLED one is refused for the stronger version of the same reason:
   * nobody attended, and a row saying ABSENT would put that against the
   * student's name in the certificate floor.
   */
  async mark(
    principal: Principal,
    sessionId: string,
    input: MarkAttendanceInput,
  ): Promise<SessionAttendance> {
    const session = await this.loadSession(principal, sessionId);
    assertTrainerMayWrite(principal, session);

    if (session.status === "CANCELLED") {
      throw ApiException.conflict(
        "This session was cancelled, so there is no register to take. Reinstate it first if it went ahead.",
      );
    }
    if (!this.hasHappened(session)) {
      throw ApiException.conflict(
        "That class has not happened yet. A register can be taken on the day, not before it.",
      );
    }

    // The second hop. The first — is this session mine — was asked above; this
    // is the one that stops a trainer marking any student in the database
    // against a session that genuinely is theirs.
    const roster = await this.prisma.studentBatchMapping.findMany({
      where: { batchId: session.batchId, deletedAt: null, isActive: true },
      select: { studentId: true },
    });
    assertOnRoster(
      input.entries.map((e) => e.studentId),
      new Set(roster.map((r) => r.studentId)),
    );

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      for (const entry of input.entries) {
        const existing = await tx.studentAttendance.findFirst({
          where: { sessionId, studentId: entry.studentId, deletedAt: null },
          select: { attendanceId: true },
        });
        const data = {
          status: entry.status,
          minutesPresent: entry.minutesPresent ?? null,
          remarks: entry.remarks || null,
          markedBy: principal.id,
          markedAt: now,
        };
        if (existing) {
          await tx.studentAttendance.update({
            where: { attendanceId: existing.attendanceId },
            data,
          });
        } else {
          await tx.studentAttendance.create({
            data: { sessionId, studentId: entry.studentId, ...data, createdBy: principal.id },
          });
        }
      }
    });

    return this.get(principal, sessionId);
  }

  /**
   * A class that has happened, by the calendar.
   *
   * Deliberately NOT "is it marked complete". Completion is the act that
   * releases assignments (invariant 17) and a trainer marks the register while
   * the room is still full — requiring completion first would mean closing the
   * session before taking it, which inverts the order of the day.
   */
  private hasHappened(session: { scheduledDate: Date }): boolean {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return session.scheduledDate <= today;
  }

  /**
   * The session, with everything both scope checks need.
   *
   * The batch's assignments come back so `trainerMayWrite` can ask whether it
   * is STILL theirs without a second query — a released trainer keeps their
   * history and loses the write, and that distinction is one row away.
   */
  private async loadSession(principal: Principal, sessionId: string) {
    const session = await this.prisma.batchSession.findFirst({
      where: { sessionId, deletedAt: null },
      include: {
        batch: {
          include: {
            trainerAssignments: { where: { deletedAt: null } },
          },
        },
      },
    });
    if (!session) throw ApiException.notFound("Session");
    assertInScope(principal, session.batch);
    // Reading is wider than writing: a trainer sees a session they delivered
    // even after release. `trainerMayWrite` is what narrows the write.
    if (
      principal.actor === "TRAINER" &&
      session.trainerId !== principal.trainerScope &&
      !trainerMayWrite(principal, session)
    ) {
      const mine =
        session.batch.primaryTrainerId === principal.trainerScope ||
        session.batch.trainerAssignments.some(
          (a) => a.trainerId === principal.trainerScope && a.status === "CONFIRMED",
        );
      if (!mine) throw ApiException.outOfScope();
    }
    return session;
  }
}
