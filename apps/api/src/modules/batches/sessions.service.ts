import { Injectable } from "@nestjs/common";
import { Prisma } from "@gurukulam/db";
import type {
  BatchSession, CreateAssignmentInput, CreateSessionInput, LinkRecordingInput, Page, Principal,
  AssignmentSubmission, AssignmentSubmissionQuery,
  GradeSubmissionInput,
  RescheduleSessionInput, SessionQuery, SessionUploadInput, SessionUploadLine,
  SessionUploadResult, UpdateAssignmentInput, UpdateSessionInput,
} from "@gurukulam/contracts";
import { PrismaService } from "../prisma/prisma.module";
import { IdService } from "../ids/id.service";
import { NotificationsService } from "../notifications/notifications.service";
import { ApiException } from "../../common/errors";
import {
  assertInScope, assertTrainerMayWrite, cityScope, collegeScope, isTrainer, liveOnly,
} from "../../common/scope/scope";
import { listPage, orderBy, paginate } from "../../common/scope/pagination";
import { parseDate } from "./batches.service";

const SORTABLE = ["scheduledDate", "sequence", "createdAt"] as const;
const SUBMISSION_SORTABLE = ["createdAt", "submittedAt", "status"] as const;

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
    private readonly notifications: NotificationsService,
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
          orderBy: orderBy(query, SORTABLE, "scheduledDate", "sessionId"),
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

      /*
       * Told only when the class has not happened yet.
       *
       * Backdating is deliberate — it is how a cohort that started two months
       * ago gets its history recorded — and a backfill of twenty historical
       * sessions would otherwise fire twenty notices at every student on the
       * roster, about classes they already attended.
       */
      if (scheduledDate >= startOfToday()) {
        await this.notifications.emitToRoster(tx, input.batchId, {
          type: "session.added",
          class: "FYI",
          title: `${session.title} was added to your schedule`,
          body: `${batch.batchCode} on ${dayOf(scheduledDate)}.`,
          ctaLabel: "See the schedule",
          ctaHref: "/portal/learning",
          subjectType: "session",
          subjectId: session.sessionId,
        });
      }

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

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.batchSession.update({
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

      /*
       * Compared, never assumed.
       *
       * `update` is also how a venue TYPO gets corrected, and "your session was
       * updated" is noise — the kind that teaches people to stop reading the
       * bell. Only the facts a student plans around count: where it is and how
       * it is delivered. A changed title or trainer is not one of them.
       */
      const moved: string[] = [];
      if (updated.mode !== session.mode) moved.push(`now ${MODE_WORD[updated.mode]}`);
      if ((updated.venue ?? "") !== (session.venue ?? "")) {
        moved.push(updated.venue === null ? "no venue set" : `now at ${updated.venue}`);
      }

      if (moved.length > 0 && updated.scheduledDate >= startOfToday()) {
        await this.notifications.emitToRoster(tx, session.batchId, {
          type: "session.updated",
          class: "FYI",
          title: `${updated.title} has changed`,
          body: `${dayOf(updated.scheduledDate)} — ${moved.join(", ")}.`,
          ctaLabel: "See the schedule",
          ctaHref: "/portal/learning",
          subjectType: "session",
          subjectId: sessionId,
        });
      }

      return toSession(updated);
    });
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

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.batchSession.update({
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

      /*
       * Says what it moved FROM.
       *
       * "Moved from Tue 14 Oct to Thu 16 Oct" is the message. "Your session was
       * rescheduled" makes every reader open the schedule to find out whether
       * they need to care — which is the work the notice was supposed to save.
       *
       * Emitted even when only the TIME moved, because a student planning their
       * day around 10:00 is as affected as one planning around Tuesday.
       */
      const sameDay = updated.scheduledDate.getTime() === session.scheduledDate.getTime();
      const from = sameDay
        ? `${hhmm(session.startTime)}`
        : `${dayOf(session.scheduledDate)}`;
      const to = sameDay
        ? `${hhmm(updated.startTime)}`
        : `${dayOf(updated.scheduledDate)} at ${hhmm(updated.startTime)}`;

      await this.notifications.emitToRoster(tx, session.batchId, {
        type: "session.rescheduled",
        class: "FYI",
        title: `${updated.title} moved from ${from} to ${to}`,
        body: input.reason,
        ctaLabel: "See the schedule",
        ctaHref: "/portal/learning",
        subjectType: "session",
        subjectId: sessionId,
      });

      return toSession(updated);
    });
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
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.batchSession.update({
        where: { sessionId },
        data: { status: "CANCELLED", cancelReason: reason },
        include: SESSION_INCLUDE,
      });

      /*
       * ALERT, not FYI — it REMOVES something a student had planned around,
       * and someone who does not read it turns up to an empty room. The reason
       * carries the weight: "the trainer is unwell" is what they need, and a
       * gap with no explanation is what generates the call to the office.
       *
       * Emitted for a past session too. Cancelling one that has already been
       * and gone is rare, but when it happens the roster has just been told
       * something about a class they may have attended, and silence would be
       * the wrong answer.
       */
      await this.notifications.emitToRoster(tx, session.batchId, {
        type: "session.cancelled",
        class: "ALERT",
        title: `${updated.title} on ${dayOf(updated.scheduledDate)} is cancelled`,
        body: reason,
        ctaLabel: "See the schedule",
        ctaHref: "/portal/learning",
        subjectType: "session",
        subjectId: sessionId,
      });

      return toSession(updated);
    });
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

  // ── Bulk upload ─────────────────────────────────────────────────────────

  /**
   * Loads a file of sessions into one batch.
   *
   * **It adds; it never replaces.** A batch's schedule arrives in instalments —
   * the first fortnight today, the rest when the trainer confirms their second
   * month — so there is no delete path here at all. Nothing this method can do
   * reduces the number of live sessions a batch has. Removing one stays a
   * deliberate single act with its own guard, because a completed session is
   * delivery history and a spreadsheet is the wrong instrument for retiring it.
   *
   * Which leaves the opposite failure, and that is the one worth engineering
   * against: the same file pasted twice, doubling the fortnight. Two mechanisms
   * catch it, because the obvious one alone does not:
   *
   *   · A row naming a `session_code` updates that session. A row naming none
   *     is new. Codes are still generated on save (invariant 9) — the column
   *     identifies, it never assigns.
   *   · A batch cannot sit in two places at once, so a row with no code that
   *     lands on a date and start time already taken is the SAME sitting. If it
   *     matches, it is reported UNCHANGED and skipped; if it disagrees, it is
   *     refused with the code to put in the file. The database holds the same
   *     rule as a partial unique index, which is what makes it safe when two
   *     operators paste at once.
   *
   * **A rejected row fails the whole file.** Loading the good half of a
   * spreadsheet is how an operator ends up with a schedule missing Tuesdays,
   * and they cannot see the gap because the upload said it worked.
   *
   * **An upload cannot move a session.** If a row's code and date disagree with
   * what is stored, that is a reschedule, and a reschedule tells the roster why
   * it moved. There is no reason column in a file, so this refuses and names
   * the screen that asks for one.
   */
  async bulkUpload(
    principal: Principal,
    batchId: string,
    input: SessionUploadInput,
  ): Promise<SessionUploadResult> {
    const batch = await this.loadBatch(principal, batchId);

    const existing = await this.prisma.batchSession.findMany({
      where: { batchId, deletedAt: null },
      select: {
        sessionId: true, sessionCode: true, title: true, status: true, sequence: true,
        scheduledDate: true, startTime: true, endTime: true, topicId: true, trainerId: true,
        mode: true, venue: true, meetingLink: true,
      },
    });

    const byCode = new Map(existing.map((row) => [row.sessionCode.toUpperCase(), row]));
    // Keyed exactly as the partial unique index is, CANCELLED excluded: a
    // session called off freed its morning, and the replacement is ordinary
    // operations rather than a duplicate.
    const bySlot = new Map(
      existing
        .filter((row) => row.status !== "CANCELLED")
        .map((row) => [slotKey(iso(row.scheduledDate), hhmm(row.startTime)), row]),
    );

    const topics = await this.prisma.courseTopic.findMany({
      where: { courseId: batch.courseId, deletedAt: null },
      select: { topicId: true, title: true },
    });
    // Topics carry no business code, so the file names them by title. Two
    // topics with one title cannot be told apart, and guessing is worse than
    // refusing — so the ambiguity is recorded and reported per row.
    const topicsByTitle = new Map<string, string[]>();
    for (const topic of topics) {
      const key = topic.title.trim().toLowerCase();
      topicsByTitle.set(key, [...(topicsByTitle.get(key) ?? []), topic.topicId]);
    }

    const trainerCodes = [...new Set(
      input.rows.map((r) => r.trainerCode?.toUpperCase()).filter((c): c is string => Boolean(c)),
    )];
    const trainers = trainerCodes.length === 0 ? [] : await this.prisma.trainer.findMany({
      where: { trainerCode: { in: trainerCodes }, deletedAt: null },
      select: {
        trainerId: true, trainerCode: true, accountStatus: true,
        // Invariant 15 — a trainer may only take a course they are approved
        // for, and a file is no exception to that.
        courses: { where: { courseId: batch.courseId, deletedAt: null }, select: { trainerCourseId: true } },
      },
    });
    const trainersByCode = new Map(trainers.map((t) => [t.trainerCode.toUpperCase(), t]));

    // Duplicates WITHIN the file, before anything is compared to the database.
    // Two rows claiming one morning is a copy-paste in the spreadsheet, and
    // reporting it against the row it collides with is more use than a unique
    // violation from Postgres at commit.
    const seenSlots = new Map<string, number>();
    const seenCodes = new Map<string, number>();
    const fileDuplicate = new Map<number, string>();
    for (const row of input.rows) {
      const slot = slotKey(row.scheduledDate, row.startTime);
      const firstSlot = seenSlots.get(slot);
      if (firstSlot === undefined) seenSlots.set(slot, row.rowNumber);
      else fileDuplicate.set(row.rowNumber, `Row ${firstSlot} already takes ${row.scheduledDate} at ${row.startTime}.`);

      const code = row.sessionCode?.toUpperCase();
      if (code) {
        const firstCode = seenCodes.get(code);
        if (firstCode === undefined) seenCodes.set(code, row.rowNumber);
        else fileDuplicate.set(row.rowNumber, `Row ${firstCode} already names ${code}.`);
      }
    }

    type Planned = {
      line: SessionUploadLine;
      /** Present for an ADD; absent for everything else. */
      create?: {
        topicId: string | null; trainerId: string | null; title: string;
        scheduledDate: Date; startTime: Date; endTime: Date;
        mode: "ONLINE" | "OFFLINE" | "HYBRID"; venue: string | null; meetingLink: string | null;
      };
      /** Present for an UPDATE. */
      update?: { sessionId: string; data: Prisma.BatchSessionUpdateInput };
    };

    const planned: Planned[] = [];

    for (const row of input.rows) {
      const base = {
        rowNumber: row.rowNumber,
        sessionId: null as string | null,
        sessionCode: row.sessionCode ?? null,
        title: row.title,
        scheduledDate: row.scheduledDate,
        startTime: row.startTime,
      };
      const reject = (detail: string): Planned => ({
        line: { ...base, outcome: "REJECT", detail },
      });

      const duplicate = fileDuplicate.get(row.rowNumber);
      if (duplicate) { planned.push(reject(duplicate)); continue; }

      // Topic, by title, within this batch's course.
      let topicId: string | null = null;
      if (row.topic) {
        const matches = topicsByTitle.get(row.topic.trim().toLowerCase()) ?? [];
        if (matches.length === 0) {
          planned.push(reject(`This batch's course has no topic called "${row.topic}".`));
          continue;
        }
        if (matches.length > 1) {
          planned.push(reject(`The course has ${matches.length} topics called "${row.topic}" — they cannot be told apart from a file.`));
          continue;
        }
        topicId = matches[0] ?? null;
      }

      // Trainer, by code. Blank inherits the batch's primary trainer, exactly
      // as scheduling one by hand does.
      let trainerId: string | null = batch.primaryTrainerId ?? null;
      if (row.trainerCode) {
        const trainer = trainersByCode.get(row.trainerCode.toUpperCase());
        if (!trainer) { planned.push(reject(`No trainer with code ${row.trainerCode}.`)); continue; }
        if (trainer.courses.length === 0) {
          planned.push(reject(`${row.trainerCode} is not approved to teach this batch's course.`));
          continue;
        }
        if (trainer.accountStatus !== "ACTIVE") {
          planned.push(reject(`${row.trainerCode} is ${trainer.accountStatus.toLowerCase()}.`));
          continue;
        }
        trainerId = trainer.trainerId;
      }

      const mode = row.mode ?? batch.mode;
      const venue = row.venue ?? batch.venue ?? null;
      const meetingLink = row.meetingLink ?? batch.meetingLink ?? null;

      if (row.sessionCode) {
        const target = byCode.get(row.sessionCode.toUpperCase());
        if (!target) { planned.push(reject(`No session ${row.sessionCode} in this batch.`)); continue; }
        if (target.status === "COMPLETED") {
          planned.push(reject(`${target.sessionCode} is delivered. Only its recording can change now.`));
          continue;
        }
        if (target.status === "CANCELLED") {
          planned.push(reject(`${target.sessionCode} was cancelled. Reinstate it on the session before editing it here.`));
          continue;
        }
        if (iso(target.scheduledDate) !== row.scheduledDate || hhmm(target.startTime) !== row.startTime) {
          planned.push(reject(
            `${target.sessionCode} sits on ${iso(target.scheduledDate)} at ${hhmm(target.startTime)}. ` +
            "Moving it is a reschedule, and the roster is told why — use Reschedule on the session.",
          ));
          continue;
        }

        const changes: string[] = [];
        const data: Prisma.BatchSessionUpdateInput = {};
        if (target.title !== row.title) { changes.push("title"); data.title = row.title; }
        if (hhmm(target.endTime) !== row.endTime) { changes.push("end time"); data.endTime = parseTime(row.endTime); }
        if (target.topicId !== topicId) { changes.push("topic"); data.topic = topicId ? { connect: { topicId } } : { disconnect: true }; }
        if (target.trainerId !== trainerId) { changes.push("trainer"); data.trainer = trainerId ? { connect: { trainerId } } : { disconnect: true }; }
        if (target.mode !== mode) { changes.push("mode"); data.mode = mode; }
        if ((target.venue ?? null) !== venue) { changes.push("venue"); data.venue = venue; }
        if ((target.meetingLink ?? null) !== meetingLink) { changes.push("link"); data.meetingLink = meetingLink; }

        planned.push(changes.length === 0
          ? { line: { ...base, outcome: "UNCHANGED", sessionId: target.sessionId, sessionCode: target.sessionCode, detail: "Already exactly this." } }
          : {
              line: { ...base, outcome: "UPDATE", sessionId: target.sessionId, sessionCode: target.sessionCode, detail: `Changes ${changes.join(", ")}.` },
              update: { sessionId: target.sessionId, data },
            });
        continue;
      }

      // No code. The slot decides whether this is the same sitting.
      const occupant = bySlot.get(slotKey(row.scheduledDate, row.startTime));
      if (occupant) {
        const sameSitting =
          occupant.title.trim().toLowerCase() === row.title.trim().toLowerCase() &&
          hhmm(occupant.endTime) === row.endTime;
        planned.push(sameSitting
          ? { line: { ...base, outcome: "UNCHANGED", sessionId: occupant.sessionId, sessionCode: occupant.sessionCode, detail: `Already scheduled as ${occupant.sessionCode}.` } }
          : reject(
              `${row.scheduledDate} at ${row.startTime} already holds ${occupant.sessionCode} "${occupant.title}". ` +
              `Put ${occupant.sessionCode} in session_code to change it, or move this row to a free slot.`,
            ));
        continue;
      }

      planned.push({
        line: { ...base, outcome: "ADD", detail: null },
        create: {
          topicId, trainerId, title: row.title,
          scheduledDate: parseDate(row.scheduledDate, "scheduledDate"),
          startTime: parseTime(row.startTime),
          endTime: parseTime(row.endTime),
          mode, venue, meetingLink,
        },
      });
    }

    const count = (outcome: SessionUploadLine["outcome"]) =>
      planned.filter((p) => p.line.outcome === outcome).length;
    const rejected = count("REJECT");

    const result = (committed: boolean): SessionUploadResult => ({
      batchId: batch.batchId,
      batchCode: batch.batchCode,
      committed,
      added: count("ADD"),
      updated: count("UPDATE"),
      unchanged: count("UNCHANGED"),
      rejected,
      existingBefore: existing.length,
      lines: planned.map((p) => p.line),
    });

    // A dry run, or anything refused, writes nothing. Both come back as a plan
    // the operator reads before committing — "it replaced my sessions" is not
    // something anyone should find out afterwards.
    if (input.dryRun || rejected > 0) return result(false);

    const toCreate = planned.filter((p) => p.create !== undefined);
    const toUpdate = planned.filter((p) => p.update !== undefined);

    try {
      await this.prisma.$transaction(async (tx) => {
        // Sequences are allocated inside the transaction, from the highest
        // live one, so an upload lands AFTER what is already there whatever
        // else has been scheduled since the plan was drawn.
        const last = await tx.batchSession.findFirst({
          where: { batchId, deletedAt: null },
          orderBy: { sequence: "desc" },
          select: { sequence: true },
        });
        let sequence = (last?.sequence ?? 0) + 1;

        for (const item of toCreate) {
          const create = item.create;
          if (!create) continue;
          const session = await tx.batchSession.create({
            data: {
              sessionCode: await this.ids.sessionCode(batch.batchCode, sequence),
              batchId,
              topicId: create.topicId,
              trainerId: create.trainerId,
              title: create.title,
              sequence,
              scheduledDate: create.scheduledDate,
              startTime: create.startTime,
              endTime: create.endTime,
              mode: create.mode,
              venue: create.venue,
              meetingLink: create.meetingLink,
              createdBy: principal.id,
            },
            select: { sessionId: true, sessionCode: true },
          });
          item.line.sessionId = session.sessionId;
          item.line.sessionCode = session.sessionCode;
          sequence += 1;
        }

        for (const item of toUpdate) {
          const update = item.update;
          if (!update) continue;
          await tx.batchSession.update({ where: { sessionId: update.sessionId }, data: update.data });
        }

        /*
         * ONE notice, however many sessions the file held.
         *
         * A fortnight's schedule is a single act of planning from the roster's
         * point of view, and fifteen "a session was added" notices is how a
         * student learns to stop reading the bell. Their schedule is the thing
         * to look at; this says it changed and points at it.
         *
         * Counted on FUTURE sessions only, for the same reason `create` is:
         * an upload of a cohort's history is a backfill, and a backfill that
         * told forty students about twenty classes they already sat through
         * would be the single loudest thing this product ever did.
         */
        const ahead = toCreate.filter(
          (item) => item.create !== undefined && item.create.scheduledDate >= startOfToday(),
        ).length;

        if (ahead > 0) {
          await this.notifications.emitToRoster(tx, batchId, {
            type: "session.added",
            class: "FYI",
            title:
              ahead === 1
                ? "A session was added to your schedule"
                : `${ahead} sessions were added to your schedule`,
            body: `${batch.batchCode}. Open My learning to see the dates.`,
            ctaLabel: "See the schedule",
            ctaHref: "/portal/learning",
            subjectType: "batch",
            subjectId: batchId,
          });
        }
      });
    } catch (error) {
      // The partial unique index firing means somebody else took one of these
      // mornings between the plan and the commit. Nothing was written.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw ApiException.conflict(
          "One of these days was taken while you were reviewing the plan. Nothing was saved — " +
            "check the plan again.",
        );
      }
      throw error;
    }

    return result(true);
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

  /**
   * One assignment, on its own.
   *
   * ── Why this exists ────────────────────────────────────────────────────
   *
   * The edit screen used to reach an assignment through its SESSION, named in
   * a query string, because there was no endpoint for one on its own. That
   * made `/batches/assignments/<id>/edit` a URL that 404s when reloaded or
   * pasted without its query — which is how the link audit found it, and which
   * is a real fragility rather than an artefact of the audit: a page that only
   * works when you arrive by clicking is a page nobody can bookmark.
   */
  async getAssignment(principal: Principal, assignmentId: string) {
    const assignment = await this.loadAssignment(principal, assignmentId);
    return toAssignment(assignment);
  }

  /**
   * The one assignment write a student hears about.
   *
   * Publishing is what turns a draft into work that has been SET — which is why
   * the notice hangs off the DRAFT → OPEN transition rather than off `create`.
   * `createAssignment` cannot produce an OPEN assignment; the column defaults
   * to DRAFT and there is no status on its input.
   */
  async updateAssignment(principal: Principal, assignmentId: string, input: UpdateAssignmentInput) {
    const assignment = await this.loadAssignment(principal, assignmentId);
    const published = input.status === "OPEN" && assignment.status !== "OPEN";

    return this.prisma.$transaction(async (tx) => {
    const updated = await tx.assignment.update({
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

      /*
       * ACTION_REQUIRED, because there is something to do. It is the only
       * class that badges, and setting work is exactly the case that earns one
       * — it clears when the student hands in, via the swept row the nightly
       * run raises the day before it is due.
       */
      if (published) {
        await this.notifications.emitToRoster(tx, assignment.batchId, {
          type: "assignment.published",
          class: "ACTION_REQUIRED",
          title: `New work: ${updated.title}`,
          body:
            updated.dueAt === null
              ? "No due date set."
              : `Due ${dayOf(updated.dueAt)}.`,
          ctaLabel: "Open it",
          ctaHref: "/portal/assignments",
          subjectType: "assignment",
          subjectId: updated.assignmentId,
        });
      }

      return toAssignment(updated);
    });
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

  // ── Submissions ─────────────────────────────────────────────────────────

  /**
   * What students have handed in.
   *
   * READ ONLY, and that is the honest shape of it today: `assignment_
   * submissions` carries marks_awarded, feedback, graded_by and graded_at, and
   * **nothing in this API writes any of them**. Grading is specified as an
   * ordinary endpoint serving both actors — an admin and a trainer mark the
   * same row — and until that exists these come back null rather than zero,
   * because "nobody has marked this" and "this scored nothing" are different
   * answers and a report cannot tell them apart afterwards.
   *
   * Scope reaches a submission through its assignment's batch, the same two
   * hops attendance will use: a submission has no city or college of its own.
   */
  async listSubmissions(
    principal: Principal,
    query: AssignmentSubmissionQuery,
  ): Promise<Page<AssignmentSubmission>> {
    const where: Prisma.AssignmentSubmissionWhereInput = {
      ...liveOnly(query.includeDeleted),
      assignment: {
        deletedAt: null,
        batch: { ...cityScope(principal), ...collegeScope(principal) },
        ...(query.batchId ? { batchId: query.batchId } : {}),
      },
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.assignmentId ? { assignmentId: query.assignmentId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    return listPage(query, async () => {
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.assignmentSubmission.findMany({
          where,
          orderBy: orderBy(query, SUBMISSION_SORTABLE, "createdAt", "submissionId"),
          ...paginate(query),
          include: SUBMISSION_INCLUDE,
        }),
        this.prisma.assignmentSubmission.count({ where }),
      ]);
      return [rows.map(toSubmission), total];
    });
  }

  /**
   * Marking a submission — the other write path that has never existed.
   *
   * `marks_awarded`, `feedback`, `graded_by` and `graded_at` have been on the
   * table since the first migration and nothing in the API has ever written
   * them. A student's "18 / 20 — clear work, look at broadcasting again" has
   * had nowhere to come from, and `/me/assignments` returns null for both
   * fields with a comment saying why.
   *
   * ── Both actors, for the same reason attendance is ─────────────────────
   *
   * The admin console cannot mark anything today either. Building this inside
   * the trainer portal would mean the operations override had to be written a
   * second time, against the same rules, by somebody else.
   *
   * ── The two hops again ─────────────────────────────────────────────────
   *
   * A submission belongs to an assignment, which belongs to a batch. For a
   * trainer the question is whether that assignment's SESSION is theirs — not
   * merely whether the batch is — so the same check attendance uses applies
   * here. An assignment with no session falls back to the batch, because there
   * is no session to be more precise about.
   */
  async gradeSubmission(
    principal: Principal,
    submissionId: string,
    input: GradeSubmissionInput,
  ) {
    const submission = await this.prisma.assignmentSubmission.findFirst({
      where: { submissionId, deletedAt: null },
      include: {
        assignment: {
          include: {
            batch: { include: { trainerAssignments: { where: { deletedAt: null } } } },
            session: true,
          },
        },
      },
    });
    if (!submission) throw ApiException.notFound("Submission");
    assertInScope(principal, submission.assignment.batch);

    if (isTrainer(principal)) {
      const session = submission.assignment.session;
      assertTrainerMayWrite(principal, {
        // No session means the assignment hangs off the batch alone, so the
        // batch is the only thing there is to check. Passing the batch's
        // primary trainer as the session's keeps one code path rather than
        // two rules that could disagree.
        trainerId: session?.trainerId ?? submission.assignment.batch.primaryTrainerId,
        batch: submission.assignment.batch,
      });
    }

    if (submission.submittedAt === null) {
      throw ApiException.conflict(
        "Nothing has been handed in against this yet, so there is nothing to mark.",
      );
    }

    const ceiling = submission.assignment.maxMarks;
    if (input.marksAwarded !== null) {
      if (ceiling === null) {
        throw ApiException.validation({
          marksAwarded: "This assignment carries no maximum, so it cannot be scored. Leave feedback instead.",
        });
      }
      if (input.marksAwarded > ceiling) {
        throw ApiException.validation({
          marksAwarded: `This assignment is out of ${ceiling}.`,
        });
      }
    }

    const graded = await this.prisma.$transaction(async (tx) => {
      const row = await tx.assignmentSubmission.update({
        where: { submissionId },
        data: {
          marksAwarded: input.marksAwarded,
          feedback: input.feedback || null,
          gradedBy: principal.id,
          gradedAt: new Date(),
          status: "GRADED",
        },
        include: SUBMISSION_INCLUDE,
      });

      /*
       * The student is told, and told what they got.
       *
       * FYI rather than ACTION_REQUIRED: a mark is news, not a task. Emitted
       * inside the same transaction as the mark, so a student is never told
       * about a grade that did not land.
       */
      await this.notifications.emit(tx, {
        type: "assignment.graded",
        class: "FYI",
        title: `${submission.assignment.title} has been marked`,
        body:
          input.marksAwarded === null
            ? "Your trainer has left feedback on it."
            : `${input.marksAwarded}${ceiling === null ? "" : ` out of ${ceiling}`}.`,
        ctaLabel: "See it",
        ctaHref: "/portal/assignments",
        recipientType: "STUDENT",
        recipientId: submission.studentId,
        subjectType: "assignment",
        subjectId: submission.assignmentId,
      });

      return row;
    });

    return toSubmission(graded);
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

    return this.prisma.$transaction(async (tx) => {
      const recording = existing
        ? await tx.sessionRecording.update({
            where: { sessionId },
            data: { ...data, deletedAt: null, deletedBy: null },
          })
        : await tx.sessionRecording.create({
            data: { sessionId, ...data, createdBy: principal.id },
          });

      /*
       * Only when it becomes PUBLISHED, and only on the transition.
       *
       * Both gates that govern whether a student can watch it are already
       * satisfied here — the session is COMPLETED (checked above) and the
       * recording is published — so the notice and the link appear together. A
       * notice for an unpublished recording would point at nothing; one sent
       * again on every subsequent edit would tell the roster about a corrected
       * title.
       */
      if (recording.isPublished && existing?.isPublished !== true) {
        await this.notifications.emitToRoster(tx, session.batchId, {
          type: "session.recording_published",
          class: "FYI",
          title: `The recording for ${session.title} is up`,
          body: `${dayOf(session.scheduledDate)}. Watch it from My learning.`,
          ctaLabel: "Watch it",
          ctaHref: "/portal/learning",
          subjectType: "session",
          subjectId: sessionId,
        });
      }

      return toRecording(recording);
    });
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
    cancelReason: row.cancelReason,
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

/** A stored DATE as the "YYYY-MM-DD" an upload file writes. */
const iso = (value: Date): string => value.toISOString().slice(0, 10);

/** A stored TIME as the "HH:MM" an upload file writes. */
const hhmm = (value: Date): string => value.toISOString().slice(11, 16);

/**
 * The key the partial unique index uses. A batch cannot sit in two places at
 * once, so this is what identifies a sitting when no code was typed.
 */
const slotKey = (date: string, start: string): string => `${date}|${start}`;

const SUBMISSION_INCLUDE = {
  assignment: { include: { batch: { select: { batchCode: true } }, session: { select: { title: true } } } },
  student: { select: { studentCode: true, firstName: true, lastName: true } },
} satisfies Prisma.AssignmentSubmissionInclude;

function toSubmission(
  row: Prisma.AssignmentSubmissionGetPayload<{ include: typeof SUBMISSION_INCLUDE }>,
): AssignmentSubmission {
  const name = [row.student?.firstName, row.student?.lastName].filter(Boolean).join(" ");
  return {
    submissionId: row.submissionId,
    assignmentId: row.assignmentId,
    assignmentCode: row.assignment?.assignmentCode ?? null,
    assignmentTitle: row.assignment?.title ?? null,
    maxMarks: row.assignment?.maxMarks ?? null,
    dueAt: row.assignment?.dueAt?.toISOString() ?? null,
    batchId: row.assignment?.batchId ?? null,
    batchCode: row.assignment?.batch?.batchCode ?? null,
    sessionId: row.assignment?.sessionId ?? null,
    sessionTitle: row.assignment?.session?.title ?? null,
    studentId: row.studentId,
    studentCode: row.student?.studentCode ?? null,
    studentName: name === "" ? null : name,
    status: row.status,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    fileUrl: row.fileUrl,
    // Null, never 0 — nothing writes these yet, and a zero would read as a mark.
    marksAwarded: row.marksAwarded,
    feedback: row.feedback,
    gradedAt: row.gradedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

const MODE_WORD: Record<string, string> = {
  ONLINE: "online",
  OFFLINE: "in person",
  HYBRID: "hybrid",
};

/** "Tue 14 Oct". Named, because 14/10 and 10/14 are different days to different readers. */
const dayOf = (d: Date): string =>
  d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

const startOfToday = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};
