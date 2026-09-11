import { Injectable } from "@nestjs/common";
import { Prisma } from "@gurukulam/db";
import { CALENDAR_GRID_DAYS } from "@gurukulam/contracts";
import type {
  Availability, CalendarEntry, CalendarQuery, DeclareAvailabilityInput, Principal,
} from "@gurukulam/contracts";
import { PrismaService } from "../prisma/prisma.module";
import { ApiException } from "../../common/errors";
import { assertInScope, cityScope, collegeScope, liveOnly } from "../../common/scope/scope";

/**
 * Trainer availability, and the calendar built from it.
 *
 * Invariant 8: free/busy is COMPUTED from committed sessions plus declared
 * leave, never stored — a stored flag drifts the first time a session moves.
 * The batch service already read this table when checking a proposal for
 * clashes; until now nothing could write it, so half that check was inert.
 *
 * The calendar is the ASSIGNMENT SURFACE, not a report: an admin picks a
 * trainer from it. So each entry answers the question actually being asked —
 * can this person take this batch? — rather than listing raw diary entries.
 */
@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async list(principal: Principal, trainerId: string): Promise<Availability[]> {
    await this.mustFindTrainer(principal, trainerId);
    const rows = await this.prisma.trainerAvailability.findMany({
      where: { trainerId, deletedAt: null },
      orderBy: { startsAt: "asc" },
      include: { trainer: { select: { name: true } } },
    });
    return rows.map(toAvailability);
  }

  /**
   * Declares leave or blocked time.
   *
   * Refused when it would cover a session the trainer is already committed to:
   * accepting it would make the calendar assert two contradictory things, and
   * the clash check would then pass or fail depending on which it read first.
   */
  async declare(
    principal: Principal,
    trainerId: string,
    input: DeclareAvailabilityInput,
  ): Promise<Availability> {
    await this.mustFindTrainer(principal, trainerId);

    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);

    const committed = await this.prisma.batchSession.findFirst({
      where: {
        trainerId,
        deletedAt: null,
        status: { notIn: ["CANCELLED", "COMPLETED"] },
        scheduledDate: { gte: startOfDay(startsAt), lte: endOfDay(endsAt) },
      },
      include: { batch: { select: { batchCode: true } } },
    });
    if (committed) {
      throw ApiException.conflict(
        `That period covers a committed session on ${committed.batch.batchCode} ` +
          `(${committed.scheduledDate.toISOString().slice(0, 10)}). Reschedule it first.`,
      );
    }

    const overlapping = await this.prisma.trainerAvailability.findFirst({
      where: {
        trainerId, deletedAt: null,
        startsAt: { lte: endsAt },
        endsAt: { gte: startsAt },
      },
    });
    if (overlapping) {
      throw ApiException.conflict("That period overlaps leave already declared.");
    }

    const created = await this.prisma.trainerAvailability.create({
      data: {
        trainerId,
        type: input.type,
        startsAt,
        endsAt,
        isFullDay: input.isFullDay,
        reason: input.reason || null,
        createdBy: principal.id,
      },
      include: { trainer: { select: { name: true } } },
    });
    return toAvailability(created);
  }

  async withdraw(principal: Principal, availabilityId: string): Promise<void> {
    const entry = await this.prisma.trainerAvailability.findFirst({
      where: { availabilityId, deletedAt: null },
      include: { trainer: true },
    });
    if (!entry) throw ApiException.notFound("Availability entry");
    assertInScope(principal, entry.trainer);

    await this.prisma.trainerAvailability.update({
      where: { availabilityId },
      data: { deletedAt: new Date(), deletedBy: principal.id },
    });
  }

  /**
   * The calendar. Free/busy computed per trainer over the window, from
   * committed sessions plus declared leave.
   *
   * When a course is named, each entry also reports whether the trainer is
   * approved for it (invariant 15) — which is the question the batch picker is
   * really asking, and answering it here saves proposing someone who will be
   * refused.
   */
  async calendar(principal: Principal, query: CalendarQuery): Promise<CalendarEntry[]> {
    const from = new Date(`${query.from.slice(0, 10)}T00:00:00.000Z`);
    const to = new Date(`${query.to.slice(0, 10)}T23:59:59.999Z`);
    if (to < from) throw ApiException.validation({ to: "The window cannot end before it starts" });

    const trainers = await this.prisma.trainer.findMany({
      where: {
        ...liveOnly(),
        ...cityScope(principal),
        accountStatus: "ACTIVE",
        ...(query.cityId ? { cityId: query.cityId } : {}),
      },
      select: {
        trainerId: true, trainerCode: true, name: true, cityId: true, maxWeeklyHours: true,
        ...(query.courseId
          ? { courses: { where: { courseId: query.courseId, deletedAt: null }, select: { trainerCourseId: true } } }
          : {}),
      },
    });

    /*
     * The days the grid will show, built once.
     *
     * Empty past a month: the grid stops being readable long before it stops
     * being cheap, and the window totals are the useful answer at that length.
     */
    // Floored, not rounded: `to` is the END of its day, so the difference is
    // one millisecond short of a whole number of days. Rounding it up invented
    // a fifteenth column on a fortnight — always empty, because the session
    // query stops at `to`.
    const span = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
    const grid: string[] =
      span > CALENDAR_GRID_DAYS
        ? []
        : Array.from({ length: span }, (_, i) =>
            new Date(from.getTime() + i * 86_400_000).toISOString().slice(0, 10),
          );

    const entries = await Promise.all(
      trainers.map(async (t) => {
        const [sessions, away] = await Promise.all([
          this.prisma.batchSession.findMany({
            where: {
              trainerId: t.trainerId,
              deletedAt: null,
              status: { notIn: ["CANCELLED"] },
              scheduledDate: { gte: from, lte: to },
              // Sessions the caller cannot see must still make the trainer
              // busy — otherwise a scoped admin proposes someone who is
              // already teaching in another region, and the clash only
              // surfaces at proposal time.
              batch: liveOnly(),
            },
            select: { scheduledDate: true, startTime: true, endTime: true },
          }),
          // Fetched rather than counted: the same rows answer both "how many
          // overlap the window" and "which days does each cover", and the
          // per-day grid is what an admin actually assigns from.
          this.prisma.trainerAvailability.findMany({
            where: {
              trainerId: t.trainerId, deletedAt: null,
              startsAt: { lte: to }, endsAt: { gte: from },
            },
            select: { startsAt: true, endsAt: true },
          }),
        ]);

        const committedHours = sessions.reduce((sum, s) => {
          const ms = s.endTime.getTime() - s.startTime.getTime();
          return sum + ms / 3_600_000;
        }, 0);

        const overHours =
          t.maxWeeklyHours !== null && committedHours > t.maxWeeklyHours * weeksIn(from, to);

        const approvedForCourse = query.courseId
          ? ((t as { courses?: unknown[] }).courses?.length ?? 0) > 0
          : null;

        return {
          trainerId: t.trainerId,
          trainerCode: t.trainerCode,
          name: t.name,
          cityId: t.cityId,
          committedSessions: sessions.length,
          declaredAway: away.length,
          committedHours: Math.round(committedHours * 10) / 10,
          maxWeeklyHours: t.maxWeeklyHours,
          overCommitted: overHours,
          free: sessions.length === 0 && away.length === 0 && !overHours,
          approvedForCourse,
          days: grid.map((date) => ({
            date,
            sessions: sessions.filter(
              (s) => s.scheduledDate.toISOString().slice(0, 10) === date,
            ).length,
            // A declared entry covers a day when it overlaps any part of it —
            // a half-day of leave still makes that day contested.
            away: away.some(
              (a) =>
                a.startsAt.toISOString().slice(0, 10) <= date &&
                a.endsAt.toISOString().slice(0, 10) >= date,
            ),
          })),
        } satisfies CalendarEntry;
      }),
    );

    const filtered = query.freeOnly ? entries.filter((e) => e.free) : entries;
    // Approved trainers first when a course was named — the picker's order.
    return filtered.sort((a, b) => {
      if (a.approvedForCourse !== b.approvedForCourse) return a.approvedForCourse ? -1 : 1;
      if (a.free !== b.free) return a.free ? -1 : 1;
      return a.committedHours - b.committedHours;
    });
  }

  private async mustFindTrainer(principal: Principal, trainerId: string) {
    const trainer = await this.prisma.trainer.findFirst({
      where: { trainerId, deletedAt: null },
    });
    if (!trainer) throw ApiException.notFound("Trainer");
    assertInScope(principal, trainer);
    void collegeScope;
    return trainer;
  }
}

function toAvailability(row: {
  availabilityId: string; trainerId: string; type: string; startsAt: Date; endsAt: Date;
  isFullDay: boolean; reason: string | null; createdAt: Date; trainer?: { name: string } | null;
}): Availability {
  return {
    availabilityId: row.availabilityId,
    trainerId: row.trainerId,
    trainerName: row.trainer?.name ?? null,
    type: row.type as Availability["type"],
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    isFullDay: row.isFullDay,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}

const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const endOfDay = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
const weeksIn = (from: Date, to: Date) =>
  Math.max(1, (to.getTime() - from.getTime()) / (7 * 86_400_000));

void Prisma;
