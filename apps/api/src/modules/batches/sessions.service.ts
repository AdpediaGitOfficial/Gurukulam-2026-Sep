import { Injectable } from "@nestjs/common";
import { Prisma } from "@gurukulam/db";
import type {
  BatchSession, CreateAssignmentInput, CreateSessionInput, LinkRecordingInput, Page, Principal,
  RescheduleSessionInput, SessionQuery, UpdateAssignmentInput, UpdateSessionInput,
} from "@gurukulam/contracts";
import { PrismaService } from "../prisma/prisma.module";
import { IdService } from "../ids/id.service";
import { ApiException } from "../../common/errors";
import { assertInScope, cityScope, collegeScope, liveOnly } from "../../common/scope/scope";
import { listPage, orderBy, paginate } from "../../common/scope/pagination";
import { parseDate } from "./batches.service";

const SORTABLE = ["scheduledDate", "sequence", "createdAt"] as const;

/**
 * Sessions, and the things that hang off them.
 *
 * The rule that shapes this module: **a session must be marked complete before
 * assignments can be set against it** (invariant 17). Completion is a
 * deliberate act, not a date passing — it releases the assignment tab and
 * prompts for the recording. A date-based rule would silently open assignments
 * on a session that was cancelled at the last minute.
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdService,
  ) {}

  async list(principal: Principal, query: SessionQuery): Promise<Page<BatchSession>> {
    const where: Prisma.BatchSessionWhereInput = {
      ...liveOnly(query.includeDeleted),
      // Sessions carry no city of their own, so scope reads through the batch.
      batch: { ...cityScope(principal), ...collegeScope(principal) },
      ...(query.batchId ? { batchId: query.batchId } : {}),
      ...(query.trainerId ? { trainerId: query.trainerId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            scheduledDate: {
              ...(query.from ? { gte: parseDate(query.from, "from") } : {}),
              ...(query.to ? { lte: parseDate(query.to, "to") } : {}),
            },
          }
        : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: "insensitive" } },
              { sessionCode: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    return listPage(query, async () => {
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.batchSession.findMany({
          where,
          orderBy: orderBy(query, SORTABLE, "scheduledDate"),
          ...paginate(query),
          include: SESSION_INCLUDE,
        }),
        this.prisma.batchSession.count({ where }),
      ]);
      return [rows.map(toSession), total];
    });
  }

  async get(principal: Principal, sessionId: string) {
    const session = await this.loadSession(principal, sessionId);
    const assignments = await this.prisma.assignment.findMany({
      where: { sessionId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
    const recording = await this.prisma.sessionRecording.findFirst({
      where: { sessionId, deletedAt: null },
    });

    return {
      ...toSession(session),
      assignments: assignments.map(toAssignment),
      recording: recording ? toRecording(recording) : null,
    };
  }

  async create(principal: Principal, input: CreateSessionInput) {
    const batch = await this.loadBatch(principal, input.batchId);

    if (input.topicId) {
      const topic = await this.prisma.courseTopic.findFirst({
        where: { topicId: input.topicId, courseId: batch.courseId, deletedAt: null },
        select: { topicId: true },
      });
      // A session is taught against a topic OF ITS BATCH'S COURSE. Anything
      // else makes the curriculum report meaningless.
      if (!topic) {
        throw ApiException.validation({ topicId: "That topic is not part of this batch's course" });
      }
    }

    const trainerId = input.trainerId ?? batch.primaryTrainerId ?? null;
    const scheduledDate = parseDate(input.scheduledDate, "scheduledDate");

    return this.prisma.$transaction(async (tx) => {
      const last = await tx.batchSession.findFirst({
        where: { batchId: input.batchId, deletedAt: null },
        orderBy: { sequence: "desc" },
        select: { sequence: true },
      });
      const sequence = (last?.sequence ?? 0) + 1;

      const session = await tx.batchSession.create({
        data: {
          sessionCode: await this.ids.sessionCode(batch.batchCode, sequence),
          batchId: input.batchId,
          topicId: input.topicId || null,
          trainerId,
          title: input.title,
          sequence,
          scheduledDate,
          startTime: parseTime(input.startTime),
          endTime: parseTime(input.endTime),
          mode: input.mode ?? batch.mode,
          venue: input.venue || batch.venue,
          meetingLink: input.meetingLink || batch.meetingLink,
          createdBy: principal.id,
        },
        include: SESSION_INCLUDE,
      });
      return toSession(session);
    });
  }

  async update(principal: Principal, sessionId: string, input: UpdateSessionInput) {
    const session = await this.loadSession(principal, sessionId);
    if (session.status === "COMPLETED") {
      throw ApiException.conflict(
        "This session is complete. Reopen it before editing, or reschedule if the date moved.",
      );
    }

    const updated = await this.prisma.batchSession.update({
      where: { sessionId },
      data: {
        ...(input.topicId !== undefined ? { topicId: input.topicId || null } : {}),
        ...(input.trainerId !== undefined ? { trainerId: input.trainerId || null } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.mode !== undefined ? { mode: input.mode } : {}),
        ...(input.venue !== undefined ? { venue: input.venue || null } : {}),
        ...(input.meetingLink !== undefined ? { meetingLink: input.meetingLink || null } : {}),
      },
      include: SESSION_INCLUDE,
    });
    return toSession(updated);
  }

  /**
   * Reschedules IN PLACE. Identity is preserved, so attendance rows and the
   * recording stay attached — creating a replacement session and cancelling
   * the old one would orphan both.
   *
   * The notification fan-out (roster, trainer, and for a college batch the
   * institution) fires from this same write once the notification service
   * exists; the reason is captured now so it has something to say.
   */
  async reschedule(principal: Principal, sessionId: string, input: RescheduleSessionInput) {
    const session = await this.loadSession(principal, sessionId);
    if (session.status === "COMPLETED") {
      throw ApiException.conflict("A completed session cannot be rescheduled.");
    }

    const updated = await this.prisma.batchSession.update({
      where: { sessionId },
      data: {
        scheduledDate: parseDate(input.scheduledDate, "scheduledDate"),
        startTime: parseTime(input.startTime),
        endTime: parseTime(input.endTime),
        ...(input.venue !== undefined ? { venue: input.venue || null } : {}),
        ...(input.meetingLink !== undefined ? { meetingLink: input.meetingLink || null } : {}),
        // Records where it moved FROM, so the change is legible afterwards.
        rescheduledFrom: session.scheduledDate,
        rescheduleReason: input.reason,
        status: "SCHEDULED",
      },
      include: SESSION_INCLUDE,
    });
    return toSession(updated);
  }

  /**
   * Marks a session complete — the deliberate act invariant 17 turns on.
   * Until this happens, no assignment can be set against the session.
   */
  async markComplete(principal: Principal, sessionId: string) {
    const session = await this.loadSession(principal, sessionId);
    if (session.status === "COMPLETED") {
      throw ApiException.conflict("That session is already complete.");
    }
    if (session.status === "CANCELLED") {
      throw ApiException.conflict("A cancelled session cannot be completed.");
    }

    const updated = await this.prisma.batchSession.update({
      where: { sessionId },
      data: { status: "COMPLETED", completedAt: new Date(), completedBy: principal.id },
      include: SESSION_INCLUDE,
    });
    return toSession(updated);
  }

  /** Reopening exists because completion is a human judgement that can be wrong. */
  async reopen(principal: Principal, sessionId: string) {
    const session = await this.loadSession(principal, sessionId);
    if (session.status !== "COMPLETED") {
      throw ApiException.conflict("That session is not complete.");
    }

    const openAssignments = await this.prisma.assignment.count({
      where: { sessionId, deletedAt: null, status: { in: ["OPEN", "CLOSED"] } },
    });
    if (openAssignments > 0) {
      throw ApiException.conflict(
        `This session has ${openAssignments} published assignment${openAssignments === 1 ? "" : "s"}. ` +
          "Reopening would leave them attached to an incomplete session.",
      );
    }

    const updated = await this.prisma.batchSession.update({
      where: { sessionId },
      data: { status: "SCHEDULED", completedAt: null, completedBy: null },
      include: SESSION_INCLUDE,
    });
    return toSession(updated);
  }

  async cancel(principal: Principal, sessionId: string, reason: string) {
    const session = await this.loadSession(principal, sessionId);
    if (session.status === "COMPLETED") {
      throw ApiException.conflict("A completed session cannot be cancelled.");
    }
    const updated = await this.prisma.batchSession.update({
      where: { sessionId },
      data: { status: "CANCELLED", cancelReason: reason },
      include: SESSION_INCLUDE,
    });
    return toSession(updated);
  }

  async remove(principal: Principal, sessionId: string): Promise<void> {
    const session = await this.loadSession(principal, sessionId);
    if (session.status === "COMPLETED") {
      throw ApiException.conflict(
        "A completed session is delivery history. Cancel a future session instead.",
      );
    }
    await this.prisma.batchSession.update({
      where: { sessionId },
      data: { deletedAt: new Date(), deletedBy: principal.id },
    });
  }

  // ── Assignments (invariants 16 and 17) ──────────────────────────────────

  async createAssignment(principal: Principal, sessionId: string, input: CreateAssignmentInput) {
    const session = await this.loadSession(principal, sessionId);

    // Invariant 17. This is the whole point of marking a session complete.
    if (session.status !== "COMPLETED") {
      throw ApiException.invariant(
        "Mark the session complete before setting assignments against it.",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.assignment.create({
        data: {
          assignmentCode: await this.ids.assignmentCode(tx),
          // An assignment belongs to a BATCH; its session link is optional
          // (invariant 16). Created here, it has both.
          batchId: session.batchId,
          sessionId,
          title: input.title,
          description: input.description || null,
          instructions: input.instructions || null,
          attachmentUrl: input.attachmentUrl || null,
          maxMarks: input.maxMarks ?? null,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          createdBy: principal.id,
        },
      });
      return toAssignment(assignment);
    });
  }

  async updateAssignment(principal: Principal, assignmentId: string, input: UpdateAssignmentInput) {
    const assignment = await this.loadAssignment(principal, assignmentId);
    const updated = await this.prisma.assignment.update({
      where: { assignmentId: assignment.assignmentId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.instructions !== undefined ? { instructions: input.instructions || null } : {}),
        ...(input.attachmentUrl !== undefined ? { attachmentUrl: input.attachmentUrl || null } : {}),
        ...(input.maxMarks !== undefined ? { maxMarks: input.maxMarks } : {}),
        ...(input.dueAt !== undefined ? { dueAt: input.dueAt ? new Date(input.dueAt) : null } : {}),
        ...(input.status !== undefined
          ? {
              status: input.status,
              ...(input.status === "OPEN" ? { publishedAt: new Date() } : {}),
              ...(input.status === "CLOSED" ? { closedAt: new Date() } : {}),
            }
          : {}),
      },
    });
    return toAssignment(updated);
  }

  async removeAssignment(principal: Principal, assignmentId: string): Promise<void> {
    const assignment = await this.loadAssignment(principal, assignmentId);
    const submissions = await this.prisma.assignmentSubmission.count({
      where: { assignmentId: assignment.assignmentId, deletedAt: null },
    });
    if (submissions > 0) {
      throw ApiException.conflict(
        `Students have submitted ${submissions} time${submissions === 1 ? "" : "s"} against this assignment.`,
      );
    }
    await this.prisma.assignment.update({
      where: { assignmentId: assignment.assignmentId },
      data: { deletedAt: new Date(), deletedBy: principal.id },
    });
  }

  // ── Recording ───────────────────────────────────────────────────────────

  /**
   * One recording per session, replaced rather than duplicated. Prompted for
   * when a session is marked complete.
   */
  async linkRecording(principal: Principal, sessionId: string, input: LinkRecordingInput) {
    const session = await this.loadSession(principal, sessionId);
    if (session.status !== "COMPLETED") {
      throw ApiException.invariant("Mark the session complete before linking its recording.");
    }

    const existing = await this.prisma.sessionRecording.findUnique({ where: { sessionId } });
    const data = {
      title: input.title || session.title,
      provider: input.provider,
      url: input.url,
      durationSeconds: input.durationSeconds ?? null,
      isPublished: input.isPublished,
      publishedAt: input.isPublished ? new Date() : null,
    };

    const recording = existing
      ? await this.prisma.sessionRecording.update({
          where: { sessionId },
          data: { ...data, deletedAt: null, deletedBy: null },
        })
      : await this.prisma.sessionRecording.create({
          data: { sessionId, ...data, createdBy: principal.id },
        });

    return toRecording(recording);
  }

  async unpublishRecording(principal: Principal, sessionId: string) {
    await this.loadSession(principal, sessionId);
    const existing = await this.prisma.sessionRecording.findUnique({ where: { sessionId } });
    if (!existing) throw ApiException.notFound("Recording");

    const recording = await this.prisma.sessionRecording.update({
      where: { sessionId },
      data: { isPublished: false, publishedAt: null },
    });
    void principal;
    return toRecording(recording);
  }

  // ── Loading with scope ──────────────────────────────────────────────────

  private async loadBatch(principal: Principal, batchId: string) {
    const batch = await this.prisma.batch.findFirst({ where: { batchId, deletedAt: null } });
    if (!batch) throw ApiException.validation({ batchId: "That batch no longer exists" });
    assertInScope(principal, batch);
    return batch;
  }

  private async loadSession(principal: Principal, sessionId: string) {
    const session = await this.prisma.batchSession.findFirst({
      where: { sessionId, deletedAt: null },
      include: SESSION_INCLUDE,
    });
    if (!session) throw ApiException.notFound("Session");
    // Scope reads through the batch — a session has no city of its own.
    assertInScope(principal, session.batch);
    return session;
  }

  private async loadAssignment(principal: Principal, assignmentId: string) {
    const assignment = await this.prisma.assignment.findFirst({
      where: { assignmentId, deletedAt: null },
      include: { batch: true },
    });
    if (!assignment) throw ApiException.notFound("Assignment");
    assertInScope(principal, assignment.batch);
    return assignment;
  }
}

const SESSION_INCLUDE = {
  batch: true,
  topic: { select: { title: true } },
  trainer: { select: { name: true } },
  recording: { select: { recordingId: true } },
  _count: { select: { assignments: true } },
} satisfies Prisma.BatchSessionInclude;

type SessionRow = Prisma.BatchSessionGetPayload<{ include: typeof SESSION_INCLUDE }>;

function toSession(row: SessionRow): BatchSession {
  return {
    sessionId: row.sessionId,
    sessionCode: row.sessionCode,
    batchId: row.batchId,
    batchCode: row.batch?.batchCode ?? null,
    topicId: row.topicId,
    topicTitle: row.topic?.title ?? null,
    trainerId: row.trainerId,
    trainerName: row.trainer?.name ?? null,
    title: row.title,
    sequence: row.sequence,
    scheduledDate: row.scheduledDate.toISOString().slice(0, 10),
    startTime: row.startTime.toISOString().slice(11, 16),
    endTime: row.endTime.toISOString().slice(11, 16),
    mode: row.mode,
    venue: row.venue,
    meetingLink: row.meetingLink,
    status: row.status,
    completedAt: row.completedAt?.toISOString() ?? null,
    rescheduledFrom: row.rescheduledFrom?.toISOString() ?? null,
    rescheduleReason: row.rescheduleReason,
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    assignmentCount: row._count.assignments,
    hasRecording: row.recording !== null,
  };
}

function toAssignment(row: {
  assignmentId: string; assignmentCode: string; batchId: string; sessionId: string | null;
  title: string; description: string | null; instructions: string | null;
  attachmentUrl: string | null; maxMarks: number | null; dueAt: Date | null;
  status: string; createdAt: Date; deletedAt: Date | null;
}) {
  return {
    assignmentId: row.assignmentId,
    assignmentCode: row.assignmentCode,
    batchId: row.batchId,
    sessionId: row.sessionId,
    title: row.title,
    description: row.description,
    instructions: row.instructions,
    attachmentUrl: row.attachmentUrl,
    maxMarks: row.maxMarks,
    dueAt: row.dueAt?.toISOString() ?? null,
    status: row.status as "DRAFT" | "OPEN" | "CLOSED",
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

function toRecording(row: {
  recordingId: string; sessionId: string; title: string | null; provider: string;
  url: string; durationSeconds: number | null; isPublished: boolean; publishedAt: Date | null;
}) {
  return {
    recordingId: row.recordingId,
    sessionId: row.sessionId,
    title: row.title,
    provider: row.provider,
    url: row.url,
    durationSeconds: row.durationSeconds,
    isPublished: row.isPublished,
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}

/** "09:30" → the epoch instant Postgres TIME round-trips through. */
function parseTime(value: string): Date {
  return new Date(`1970-01-01T${value}:00.000Z`);
}
