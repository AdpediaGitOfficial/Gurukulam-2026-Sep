import { Injectable } from "@nestjs/common";
import { Prisma } from "@gurukulam/db";
import type {
  Batch, BatchQuery, CreateBatchInput, Page, Principal,
  ProposeTrainerInput, RespondToProposalInput, UpdateBatchInput,
  BatchDetail, TrainerCandidate,
} from "@gurukulam/contracts";
import { PrismaService } from "../prisma/prisma.module";
import { IdService } from "../ids/id.service";
import { ApiException } from "../../common/errors";
import { assertInScope, cityScope, collegeScope, liveOnly } from "../../common/scope/scope";
import { withBusinessIdRetry } from "../../common/business-id-retry";
import { listPage, orderBy, paginate } from "../../common/scope/pagination";

const SORTABLE = ["startDate", "batchCode", "name", "createdAt"] as const;

/**
 * Batches.
 *
 * `collegeId` is what separates the two segments: set means a dedicated
 * college batch, null means an open retail batch. Nothing else distinguishes
 * them, and the rosters never mix (invariant 2) — enforced where students are
 * allocated, because a CHECK cannot reach across from a mapping row to a
 * student's college.
 *
 * The trainer handshake lives here too: an admin proposes, the trainer
 * confirms, and only then is it committed delivery (invariant 9).
 */
@Injectable()
export class BatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdService,
  ) {}

  async list(principal: Principal, query: BatchQuery): Promise<Page<Batch>> {
    const where: Prisma.BatchWhereInput = {
      ...liveOnly(query.includeDeleted),
      ...cityScope(principal),
      ...collegeScope(principal),
      ...(query.courseId ? { courseId: query.courseId } : {}),
      ...(query.collegeId ? { collegeId: query.collegeId } : {}),
      ...(query.cityId ? { cityId: query.cityId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.trainerId ? { primaryTrainerId: query.trainerId } : {}),
      // Segment is derived, never stored — the null-ness of collegeId IS the
      // distinction, so filtering on it cannot drift from reality.
      ...(query.segment === "RETAIL" ? { collegeId: null } : {}),
      ...(query.segment === "COLLEGE" ? { collegeId: { not: null } } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: "insensitive" } },
              { batchCode: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    return listPage(query, async () => {
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.batch.findMany({
          where,
          orderBy: orderBy(query, SORTABLE, "startDate"),
          ...paginate(query),
          include: BATCH_INCLUDE,
        }),
        this.prisma.batch.count({ where }),
      ]);
      return [rows.map(toBatch), total];
    });
  }

  async get(principal: Principal, batchId: string): Promise<BatchDetail> {
    const batch = await this.prisma.batch.findFirst({
      where: { batchId, deletedAt: null },
      include: {
        ...BATCH_INCLUDE,
        trainerAssignments: {
          where: { deletedAt: null },
          orderBy: { proposedAt: "desc" },
          include: { trainer: { select: { name: true } } },
        },
      },
    });
    if (!batch) throw ApiException.notFound("Batch");
    assertInScope(principal, batch);

    return {
      ...toBatch(batch),
      trainerAssignments: batch.trainerAssignments.map((a) => ({
        assignmentId: a.assignmentId,
        batchId: a.batchId,
        trainerId: a.trainerId,
        trainerName: a.trainer.name,
        status: a.status,
        proposedAt: a.proposedAt.toISOString(),
        respondedAt: a.respondedAt?.toISOString() ?? null,
        declineReason: a.declineReason,
      })),
    };
  }

  async create(principal: Principal, input: CreateBatchInput) {
    const course = await this.prisma.course.findFirst({
      where: { courseId: input.courseId, deletedAt: null },
      select: { courseId: true, name: true },
    });
    if (!course) throw ApiException.validation({ courseId: "That course no longer exists" });

    let cityId = input.cityId ?? null;

    if (input.collegeId) {
      const college = await this.prisma.college.findFirst({
        where: { collegeId: input.collegeId, deletedAt: null },
        select: { collegeId: true, cityId: true },
      });
      if (!college) throw ApiException.validation({ collegeId: "That college no longer exists" });
      assertInScope(principal, { cityId: college.cityId, collegeId: college.collegeId });
      // A dedicated batch inherits the college's city unless one was given.
      cityId ??= college.cityId;
    }

    if (cityId) assertInScope(principal, { cityId });
    else if (principal.cityScope !== null) {
      throw ApiException.validation({ cityId: "Select a city within your region" });
    }

    const startDate = parseDate(input.startDate, "startDate");
    const endDate = input.endDate ? parseDate(input.endDate, "endDate") : null;
    if (endDate && endDate < startDate) {
      throw ApiException.validation({ endDate: "The batch cannot end before it starts" });
    }

    // A confirmed requirement keeps a link to the batch it produced
    // (invariant 14), so confirmation and batch creation are one act.
    let requirement: { requirementId: string; collegeId: string; batchId: string | null } | null = null;
    if (input.requirementId) {
      requirement = await this.prisma.collegeRequirement.findFirst({
        where: { requirementId: input.requirementId, deletedAt: null },
        select: { requirementId: true, collegeId: true, batchId: true },
      });
      if (!requirement) {
        throw ApiException.validation({ requirementId: "That requirement no longer exists" });
      }
      if (requirement.batchId) {
        throw ApiException.conflict("That requirement has already produced a batch");
      }
      if (input.collegeId && requirement.collegeId !== input.collegeId) {
        throw ApiException.validation({
          requirementId: "That requirement belongs to a different college",
        });
      }
    }

    return withBusinessIdRetry(async () => {
      // Allocated OUTSIDE the transaction: inside, a failed insert would roll
      // the counter back and every retry would ask for the same number.
      const batchCode = await this.ids.batchCode(course.name, startDate);
      return this.prisma.$transaction(async (tx) => {
      const batch = await tx.batch.create({
        data: {
          batchCode,
          name: input.name,
          courseId: input.courseId,
          collegeId: input.collegeId ?? requirement?.collegeId ?? null,
          cityId,
          mode: input.mode,
          startDate,
          endDate,
          maxCapacity: input.maxCapacity ?? null,
          venue: input.venue || null,
          meetingLink: input.meetingLink || null,
          notes: input.notes || null,
          createdBy: principal.id,
        },
        include: BATCH_INCLUDE,
      });

      if (requirement) {
        await tx.collegeRequirement.update({
          where: { requirementId: requirement.requirementId },
          data: {
            batchId: batch.batchId,
            status: "CONFIRMED",
            confirmedBy: principal.id,
            confirmedAt: new Date(),
          },
        });
      }

        return toBatch(batch);
      });
    });
  }

  async update(principal: Principal, batchId: string, input: UpdateBatchInput) {
    const existing = await this.mustExist(principal, batchId);

    const startDate = input.startDate ? parseDate(input.startDate, "startDate") : existing.startDate;
    const endDate =
      input.endDate !== undefined
        ? input.endDate
          ? parseDate(input.endDate, "endDate")
          : null
        : existing.endDate;
    if (endDate && endDate < startDate) {
      throw ApiException.validation({ endDate: "The batch cannot end before it starts" });
    }
    if (input.cityId) assertInScope(principal, { cityId: input.cityId });

    const batch = await this.prisma.batch.update({
      where: { batchId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.cityId !== undefined ? { cityId: input.cityId || null } : {}),
        ...(input.mode !== undefined ? { mode: input.mode } : {}),
        ...(input.startDate !== undefined ? { startDate } : {}),
        ...(input.endDate !== undefined ? { endDate } : {}),
        ...(input.maxCapacity !== undefined ? { maxCapacity: input.maxCapacity } : {}),
        ...(input.venue !== undefined ? { venue: input.venue || null } : {}),
        ...(input.meetingLink !== undefined ? { meetingLink: input.meetingLink || null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
      include: BATCH_INCLUDE,
    });
    return toBatch(batch);
    // courseId and collegeId are absent by design: changing either would move
    // a batch between segments or curricula under an existing roster.
  }

  /**
   * Proposes a trainer (invariant 9 — a proposal is not committed delivery).
   *
   * Guarded by invariant 15 (the trainer must be approved for this batch's
   * course) and invariant 8's read side: free/busy is COMPUTED from committed
   * sessions plus declared leave, so a double-booking is detected here rather
   * than stored anywhere.
   */
  async proposeTrainer(principal: Principal, batchId: string, input: ProposeTrainerInput) {
    const batch = await this.mustExist(principal, batchId);

    const trainer = await this.prisma.trainer.findFirst({
      where: { trainerId: input.trainerId, deletedAt: null },
      select: { trainerId: true, name: true, accountStatus: true },
    });
    if (!trainer) throw ApiException.validation({ trainerId: "That trainer no longer exists" });
    if (trainer.accountStatus !== "ACTIVE") {
      throw ApiException.validation({ trainerId: "That trainer's account is not active" });
    }

    // Invariant 15. Free-text skill tags cannot answer this — approval is a
    // relationship.
    const approved = await this.prisma.trainerCourse.findFirst({
      where: { trainerId: input.trainerId, courseId: batch.courseId, deletedAt: null },
      select: { trainerCourseId: true },
    });
    if (!approved) {
      throw ApiException.invariant(
        `${trainer.name} is not approved to teach this batch's course. Approve them first.`,
      );
    }

    const open = await this.prisma.batchTrainerAssignment.findFirst({
      where: { batchId, deletedAt: null, status: { in: ["PROPOSED", "CONFIRMED"] } },
      include: { trainer: { select: { name: true } } },
    });
    if (open) {
      throw ApiException.conflict(
        open.status === "CONFIRMED"
          ? `${open.trainer.name} is already confirmed on this batch.`
          : `${open.trainer.name} has an open proposal on this batch. Withdraw it first.`,
      );
    }

    const clash = await this.findScheduleClash(input.trainerId, batchId);
    if (clash) throw ApiException.invariant(clash);

    const assignment = await this.prisma.batchTrainerAssignment.create({
      data: {
        batchId,
        trainerId: input.trainerId,
        status: "PROPOSED",
        proposedBy: principal.id,
        createdBy: principal.id,
      },
      include: { trainer: { select: { name: true } } },
    });

    return toAssignment(assignment);
  }

  /**
   * The trainer's answer. An admin may record it on their behalf — the admin
   * portal performs every action the deferred portals will.
   *
   * Confirming sets `batches.primary_trainer_id`; declining returns the batch
   * to unassigned and keeps the reason. Nothing is auto-reassigned.
   */
  async respondToProposal(principal: Principal, batchId: string, input: RespondToProposalInput) {
    await this.mustExist(principal, batchId);

    const proposal = await this.prisma.batchTrainerAssignment.findFirst({
      where: { batchId, deletedAt: null, status: "PROPOSED" },
      include: { trainer: { select: { name: true } } },
    });
    if (!proposal) throw ApiException.notFound("Open proposal");

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.batchTrainerAssignment.update({
        where: { assignmentId: proposal.assignmentId },
        data: {
          status: input.decision === "CONFIRM" ? "CONFIRMED" : "DECLINED",
          respondedAt: new Date(),
          declineReason: input.decision === "DECLINE" ? (input.reason ?? null) : null,
        },
        include: { trainer: { select: { name: true } } },
      });

      await tx.batch.update({
        where: { batchId },
        data: {
          // Only a CONFIRMED assignment makes a primary trainer. A declined
          // one leaves the batch unassigned for an admin to propose again.
          primaryTrainerId: input.decision === "CONFIRM" ? proposal.trainerId : null,
        },
      });

      if (input.decision === "CONFIRM") {
        // Sessions already scheduled under the batch inherit the confirmed
        // trainer, so the availability calendar reflects committed delivery.
        await tx.batchSession.updateMany({
          where: { batchId, deletedAt: null, trainerId: null },
          data: { trainerId: proposal.trainerId },
        });
      }

      return toAssignment(updated);
    });
  }

  /** Withdraws an open proposal, so another trainer can be put forward. */
  async withdrawProposal(principal: Principal, batchId: string): Promise<void> {
    await this.mustExist(principal, batchId);
    const proposal = await this.prisma.batchTrainerAssignment.findFirst({
      where: { batchId, deletedAt: null, status: "PROPOSED" },
    });
    if (!proposal) throw ApiException.notFound("Open proposal");

    await this.prisma.batchTrainerAssignment.update({
      where: { assignmentId: proposal.assignmentId },
      data: { deletedAt: new Date(), deletedBy: principal.id },
    });
  }

  async remove(principal: Principal, batchId: string): Promise<void> {
    await this.mustExist(principal, batchId);

    const enrolled = await this.prisma.studentBatchMapping.count({
      where: { batchId, deletedAt: null },
    });
    if (enrolled > 0) {
      throw ApiException.conflict(
        `This batch has ${enrolled} student${enrolled === 1 ? "" : "s"} on its roster. ` +
          "Move them first, or cancel the batch instead.",
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.batchSession.updateMany({
        where: { batchId, deletedAt: null },
        data: { deletedAt: new Date(), deletedBy: principal.id },
      });
      await tx.batch.update({
        where: { batchId },
        data: { deletedAt: new Date(), deletedBy: principal.id },
      });
    });
  }

  /**
   * Invariant 8's read side: free/busy computed from committed sessions plus
   * declared leave, never stored — storing it drifts the first time a session
   * moves.
   */
  private async findScheduleClash(trainerId: string, batchId: string): Promise<string | null> {
    const sessions = await this.prisma.batchSession.findMany({
      where: { batchId, deletedAt: null, status: { notIn: ["CANCELLED"] } },
      select: { scheduledDate: true, startTime: true, endTime: true },
    });
    if (sessions.length === 0) return null;

    const dates = sessions.map((s) => s.scheduledDate);
    const busy = await this.prisma.batchSession.findMany({
      where: {
        trainerId,
        deletedAt: null,
        status: { notIn: ["CANCELLED"] },
        batchId: { not: batchId },
        scheduledDate: { in: dates },
      },
      select: { scheduledDate: true, startTime: true, endTime: true, batch: { select: { batchCode: true } } },
    });

    const leave = await this.prisma.trainerAvailability.findFirst({
      where: {
        trainerId,
        deletedAt: null,
        startsAt: { lte: dates[dates.length - 1] },
        endsAt: { gte: dates[0] },
      },
      select: { availabilityId: true },
    });

    return clashReason(sessions, busy, leave !== null);
  }

  /**
   * Who may be proposed for this batch, and who would be refused.
   *
   * Only trainers approved for the batch's course: proposing anyone else is
   * refused outright (invariant 15), so offering them is offering a mistake.
   *
   * The refusal each would produce is computed by `clashReason` — the same
   * function the proposal itself uses. A picker that reasoned separately would
   * eventually disagree with the endpoint, and a warning that disagrees with
   * the refusal is worse than none.
   *
   * The per-trainer queries are hoisted: one read of this batch's sessions, one
   * of everyone else's on those days, one of everyone's leave — rather than
   * three per candidate.
   */
  async trainerCandidates(principal: Principal, batchId: string): Promise<TrainerCandidate[]> {
    const batch = await this.mustExist(principal, batchId);

    const trainers = await this.prisma.trainer.findMany({
      where: {
        deletedAt: null,
        accountStatus: "ACTIVE",
        ...cityScope(principal),
        courses: { some: { courseId: batch.courseId, deletedAt: null } },
      },
      select: {
        trainerId: true, trainerCode: true, name: true, city: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    });
    if (trainers.length === 0) return [];

    const sessions = await this.prisma.batchSession.findMany({
      where: { batchId, deletedAt: null, status: { notIn: ["CANCELLED"] } },
      select: { scheduledDate: true, startTime: true, endTime: true },
    });

    const ids = trainers.map((t) => t.trainerId);
    const dates = sessions.map((s) => s.scheduledDate);

    // A batch with no sessions cannot clash with anything, which is exactly
    // what the proposal check concludes — so neither read is worth making.
    const [busy, leave] = sessions.length === 0
      ? [[], []]
      : await Promise.all([
          this.prisma.batchSession.findMany({
            where: {
              trainerId: { in: ids },
              deletedAt: null,
              status: { notIn: ["CANCELLED"] },
              batchId: { not: batchId },
              scheduledDate: { in: dates },
            },
            select: {
              trainerId: true, scheduledDate: true, startTime: true, endTime: true,
              batch: { select: { batchCode: true } },
            },
          }),
          this.prisma.trainerAvailability.findMany({
            where: {
              trainerId: { in: ids },
              deletedAt: null,
              startsAt: { lte: dates[dates.length - 1] },
              endsAt: { gte: dates[0] },
            },
            select: { trainerId: true },
          }),
        ]);

    const onLeave = new Set(leave.map((l) => l.trainerId));

    const candidates = trainers.map((trainer) => {
      const theirs = busy.filter((b) => b.trainerId === trainer.trainerId);
      return {
        trainerId: trainer.trainerId,
        trainerCode: trainer.trainerCode,
        name: trainer.name,
        cityName: trainer.city?.name ?? null,
        committedSessions: theirs.length,
        blockedReason: clashReason(sessions, theirs, onLeave.has(trainer.trainerId)),
      } satisfies TrainerCandidate;
    });

    // Proposable first, then the least committed of them — the order an admin
    // would sort by anyway.
    return candidates.sort((a, b) => {
      if ((a.blockedReason === null) !== (b.blockedReason === null)) {
        return a.blockedReason === null ? -1 : 1;
      }
      return a.committedSessions - b.committedSessions;
    });
  }

  private async mustExist(principal: Principal, batchId: string) {
    const batch = await this.prisma.batch.findFirst({ where: { batchId, deletedAt: null } });
    if (!batch) throw ApiException.notFound("Batch");
    assertInScope(principal, batch);
    return batch;
  }
}

const BATCH_INCLUDE = {
  course: { select: { name: true } },
  college: { select: { name: true } },
  city: { select: { name: true } },
  primaryTrainer: { select: { name: true } },
  _count: { select: { sessions: true, studentMappings: true } },
} satisfies Prisma.BatchInclude;

type BatchRow = Prisma.BatchGetPayload<{ include: typeof BATCH_INCLUDE }>;

function toBatch(row: BatchRow): Batch {
  return {
    batchId: row.batchId,
    batchCode: row.batchCode,
    name: row.name,
    courseId: row.courseId,
    courseName: row.course?.name ?? null,
    collegeId: row.collegeId,
    collegeName: row.college?.name ?? null,
    // Derived from the null-ness of collegeId, so it can never disagree.
    segment: row.collegeId === null ? "RETAIL" : "COLLEGE",
    cityId: row.cityId,
    cityName: row.city?.name ?? null,
    primaryTrainerId: row.primaryTrainerId,
    primaryTrainerName: row.primaryTrainer?.name ?? null,
    mode: row.mode,
    startDate: row.startDate.toISOString().slice(0, 10),
    endDate: row.endDate?.toISOString().slice(0, 10) ?? null,
    maxCapacity: row.maxCapacity,
    venue: row.venue,
    meetingLink: row.meetingLink,
    notes: row.notes,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    sessionCount: row._count.sessions,
    enrolledCount: row._count.studentMappings,
  };
}

function toAssignment(row: { assignmentId: string; batchId: string; trainerId: string; status: string; proposedAt: Date; respondedAt: Date | null; declineReason: string | null; trainer: { name: string } }) {
  return {
    assignmentId: row.assignmentId,
    batchId: row.batchId,
    trainerId: row.trainerId,
    trainerName: row.trainer.name,
    status: row.status as "PROPOSED" | "CONFIRMED" | "DECLINED",
    proposedAt: row.proposedAt.toISOString(),
    respondedAt: row.respondedAt?.toISOString() ?? null,
    declineReason: row.declineReason,
  };
}

/**
 * Why a trainer cannot take this batch, or null.
 *
 * The single statement of the rule: the proposal endpoint and the candidate
 * list both call it, so the warning an admin sees is the refusal they would
 * get, word for word.
 *
 * A batch with no sessions never clashes — there is nothing yet to collide
 * with, and saying otherwise would block an assignment made before the
 * schedule is built, which is the normal order.
 */
function clashReason(
  sessions: ReadonlyArray<{ scheduledDate: Date; startTime: Date; endTime: Date }>,
  busy: ReadonlyArray<{
    scheduledDate: Date;
    startTime: Date;
    endTime: Date;
    batch: { batchCode: string };
  }>,
  onLeave: boolean,
): string | null {
  if (sessions.length === 0) return null;

  for (const session of sessions) {
    for (const other of busy) {
      if (other.scheduledDate.getTime() !== session.scheduledDate.getTime()) continue;
      if (overlaps(session, other)) {
        const day = session.scheduledDate.toISOString().slice(0, 10);
        return `That trainer is already teaching ${other.batch.batchCode} on ${day} at the same time.`;
      }
    }
  }

  if (onLeave) return `That trainer has declared leave overlapping this batch's schedule.`;

  return null;
}

function overlaps(
  a: { startTime: Date; endTime: Date },
  b: { startTime: Date; endTime: Date },
): boolean {
  // Times are stored as TIME, which Prisma surfaces on the epoch date, so
  // comparing the instants compares the clock times.
  return a.startTime < b.endTime && b.startTime < a.endTime;
}

export function parseDate(value: string, field: string): Date {
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw ApiException.validation({ [field]: "Enter a date like 2026-09-07" });
  }
  return parsed;
}
