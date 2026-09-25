import { Injectable } from "@nestjs/common";
import type {
  MeBatch,
  MeHome,
  MeProfile,
  MeSchedule,
  MeSession,
  Principal,
  UpdateMeInput,
} from "@gurukulam/contracts";
import { PrismaService } from "../prisma/prisma.module";
import { ApiException } from "../../common/errors";

/**
 * The student's own surface.
 *
 * ── Why this is a module and not a scope on the admin endpoints ─────────
 *
 * A student principal has `cityScope: null` and `collegeScope: null`, and in
 * this codebase null means GLOBAL. They are kept out of the admin surface by
 * holding no permissions at all — which fails closed, and is right — but it
 * means the college portal's approach, handing the same endpoints a narrower
 * scope, cannot work here.
 *
 * The alternative would be a third scope axis and a per-actor projection
 * inside the admin mappers. That is how a field escapes: the projection is one
 * `if` away from being wrong and nothing fails when it is. Here, `notes`,
 * `suspendedReason`, `createdBy` and the ledger's internals never enter the
 * function.
 *
 * ── The one rule every read here shares ─────────────────────────────────
 *
 * Every query is anchored to `principal.id` and never to an id from the
 * request. There is no `studentId` parameter anywhere in this service, so
 * there is nothing for a caller to tamper with — the scope is structural
 * rather than checked.
 */
@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Profile ─────────────────────────────────────────────────────────────

  async profile(principal: Principal): Promise<MeProfile> {
    const student = await this.prisma.student.findFirst({
      where: { studentId: principal.id, deletedAt: null },
      include: { college: { select: { name: true } }, city: { select: { name: true } } },
    });
    if (!student) throw ApiException.notFound("Student");

    return {
      studentId: student.studentId,
      studentCode: student.studentCode,
      firstName: student.firstName,
      lastName: student.lastName,
      email: student.email,
      loginEmail: student.loginEmail,
      phone: student.phone,
      altPhone: student.altPhone,
      addressLine1: student.addressLine1,
      addressLine2: student.addressLine2,
      postalCode: student.postalCode,
      cityName: student.city?.name ?? null,
      discipline: student.discipline,
      passoutYear: student.passoutYear,
      photoUrl: student.photoUrl,
      // Derived, never stored: a student with no college is retail and always
      // will be (invariant 1).
      segment: student.collegeId === null ? "RETAIL" : "COLLEGE",
      collegeName: student.college?.name ?? null,
      enrolledOn: student.createdAt.toISOString(),
    };
  }

  /**
   * The narrow edit.
   *
   * The field list is the contract's, not a spread of the request: a key that
   * is not named here cannot be written, whatever arrives in the body. An
   * empty string clears the column — that is a person deleting their alternate
   * number, which is a real thing to want, and distinct from omitting the key.
   */
  async updateProfile(principal: Principal, input: UpdateMeInput): Promise<MeProfile> {
    const student = await this.prisma.student.findFirst({
      where: { studentId: principal.id, deletedAt: null },
      select: { studentId: true },
    });
    if (!student) throw ApiException.notFound("Student");

    const text = (value: string | undefined): string | null | undefined =>
      value === undefined ? undefined : value.trim() === "" ? null : value.trim();

    await this.prisma.student.update({
      where: { studentId: principal.id },
      data: {
        phone: text(input.phone),
        altPhone: text(input.altPhone),
        addressLine1: text(input.addressLine1),
        addressLine2: text(input.addressLine2),
        postalCode: text(input.postalCode),
      },
    });

    return this.profile(principal);
  }

  // ── My learning ─────────────────────────────────────────────────────────

  /**
   * The batches this student sits on, finished ones included.
   *
   * A completed or exited enrolment still shows: the batch they finished is
   * how they explain the certificate they hold, and a roster they left is part
   * of their own history. Only a DEALLOCATED mapping disappears — that is the
   * admin saying they should never have been on it at all.
   */
  async batches(principal: Principal): Promise<MeBatch[]> {
    const mappings = await this.prisma.studentBatchMapping.findMany({
      where: { studentId: principal.id, deletedAt: null },
      include: {
        batch: {
          include: {
            course: { select: { name: true } },
            primaryTrainer: { select: { name: true } },
            _count: { select: { sessions: { where: { deletedAt: null } } } },
          },
        },
      },
      orderBy: { enrolledAt: "desc" },
    });

    const batchIds = mappings.map((m) => m.batchId);
    const delivered = await this.prisma.batchSession.groupBy({
      by: ["batchId"],
      where: { batchId: { in: batchIds }, deletedAt: null, status: "COMPLETED" },
      _count: { _all: true },
    });
    const deliveredBy = new Map(delivered.map((row) => [row.batchId, row._count._all]));

    return mappings.map((m) => ({
      batchId: m.batchId,
      batchCode: m.batch.batchCode,
      name: m.batch.name,
      courseName: m.batch.course?.name ?? null,
      mode: m.batch.mode,
      startDate: m.batch.startDate.toISOString().slice(0, 10),
      endDate: m.batch.endDate?.toISOString().slice(0, 10) ?? null,
      trainerName: m.batch.primaryTrainer?.name ?? null,
      venue: m.batch.venue,
      enrolledAt: m.enrolledAt.toISOString(),
      // Completion and exit are independent flags on the mapping, not one
      // status, because a batch can end both ways for different people.
      outcome: m.completedAt !== null ? "COMPLETED" : m.isActive ? "ACTIVE" : "LEFT",
      completedAt: m.completedAt?.toISOString() ?? null,
      sessionCount: m.batch._count.sessions,
      deliveredCount: deliveredBy.get(m.batchId) ?? 0,
    }));
  }

  /**
   * Every session on every batch of theirs, split into what is still to come
   * and what has already happened.
   *
   * ── The two gates on a recording ────────────────────────────────────────
   *
   * A recording appears only when its session is COMPLETED **and** the
   * recording is published. Both gates already exist in the schema, and the
   * first is invariant 10's shape: a link attached to a session nobody has
   * marked delivered is either a mistake or a promise the system cannot keep,
   * and the portal is not the place that ordering is first broken.
   */
  async schedule(principal: Principal): Promise<MeSchedule> {
    const mappings = await this.prisma.studentBatchMapping.findMany({
      where: { studentId: principal.id, deletedAt: null },
      select: { batchId: true },
    });
    const batchIds = mappings.map((m) => m.batchId);
    if (batchIds.length === 0) return { upcoming: [], past: [] };

    const rows = await this.prisma.batchSession.findMany({
      where: { batchId: { in: batchIds }, deletedAt: null },
      include: {
        batch: { select: { batchCode: true, course: { select: { name: true } } } },
        topic: { select: { title: true } },
        trainer: { select: { name: true } },
        recording: true,
      },
      orderBy: [{ scheduledDate: "asc" }, { startTime: "asc" }],
    });

    // Compared against the START OF TODAY, not `now()`: `scheduledDate` is a
    // DATE column, so a session earlier this morning is still today's class
    // and belongs with what is coming rather than with history.
    const today = startOfToday();

    const upcoming: MeSession[] = [];
    const past: MeSession[] = [];
    for (const row of rows) {
      const session = toSession(row);
      if (row.scheduledDate >= today && row.status !== "COMPLETED") upcoming.push(session);
      else past.push(session);
    }
    // History reads newest first; what is coming reads soonest first.
    past.reverse();

    return { upcoming, past };
  }

  /**
   * The landing page.
   *
   * Three answers, not a dashboard of metrics: a student has no fleet to
   * survey. When is my next session, what am I on, and what can I catch up on.
   */
  async home(principal: Principal): Promise<MeHome> {
    const [profile, batches, schedule] = await Promise.all([
      this.profile(principal),
      this.batches(principal),
      this.schedule(principal),
    ]);

    return {
      firstName: profile.firstName,
      segment: profile.segment,
      nextSession: schedule.upcoming[0] ?? null,
      activeBatches: batches.filter((b) => b.outcome === "ACTIVE").length,
      completedBatches: batches.filter((b) => b.outcome === "COMPLETED").length,
      deliveredSessions: schedule.past.filter((s) => s.status === "COMPLETED").length,
      availableRecordings: schedule.past.filter((s) => s.recording !== null).length,
    };
  }
}

type SessionRow = {
  sessionId: string;
  sessionCode: string;
  title: string;
  batchId: string;
  scheduledDate: Date;
  startTime: Date;
  endTime: Date;
  mode: MeSession["mode"];
  venue: string | null;
  meetingLink: string | null;
  status: MeSession["status"];
  cancelReason: string | null;
  rescheduledFrom: Date | null;
  batch: { batchCode: string; course: { name: string } | null };
  topic: { title: string } | null;
  trainer: { name: string } | null;
  recording: { url: string; title: string | null; provider: string; isPublished: boolean } | null;
};

function toSession(row: SessionRow): MeSession {
  return {
    sessionId: row.sessionId,
    sessionCode: row.sessionCode,
    title: row.title,
    batchId: row.batchId,
    batchCode: row.batch.batchCode,
    courseName: row.batch.course?.name ?? null,
    topicTitle: row.topic?.title ?? null,
    trainerName: row.trainer?.name ?? null,
    scheduledDate: row.scheduledDate.toISOString().slice(0, 10),
    startTime: row.startTime.toISOString().slice(11, 16),
    endTime: row.endTime.toISOString().slice(11, 16),
    mode: row.mode,
    venue: row.venue,
    meetingLink: row.meetingLink,
    status: row.status,
    cancelReason: row.cancelReason,
    rescheduledFrom: row.rescheduledFrom?.toISOString() ?? null,
    // Both gates, in one expression, so neither can be applied without the
    // other: delivered, and published.
    recording:
      row.status === "COMPLETED" && row.recording !== null && row.recording.isPublished
        ? {
            url: row.recording.url,
            title: row.recording.title,
            provider: row.recording.provider,
          }
        : null,
  };
}

const startOfToday = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};
