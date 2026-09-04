import "server-only";

import { z } from "zod";
import {
  availabilitySchema,
  calendarEntrySchema,
  trainerDetailSchema,
  trainerSchema,
  type Availability,
  type CalendarEntry,
  type Page,
  type Trainer,
  type TrainerDetail,
} from "@gurukulam/contracts";

import { apiFetch } from "@/server/api";
import { fetchPage, PAGE_KEYS, queryString, type SearchParams } from "@/server/list";

export const TRAINER_FILTERS = [
  ...PAGE_KEYS,
  "cityId",
  "approvedForCourseId",
  "accountStatus",
] as const;

export async function listTrainers(params: SearchParams): Promise<Page<Trainer>> {
  return fetchPage("/trainers", trainerSchema, params, TRAINER_FILTERS);
}

/** One trainer with the courses they are approved to deliver. */
export async function getTrainer(trainerId: string): Promise<TrainerDetail> {
  return trainerDetailSchema.parse(await apiFetch(`/trainers/${trainerId}`));
}

/**
 * Declared leave and blocked time for one trainer.
 *
 * A plain array, not a page: this is a person's diary, not a directory, and
 * the endpoint returns the lot.
 *
 * Free/busy is COMPUTED from these entries plus committed sessions, never
 * stored — so this list is one half of the answer, and the batch schedule is
 * the other.
 */
export async function listAvailability(trainerId: string): Promise<Availability[]> {
  return z
    .array(availabilitySchema)
    .parse(await apiFetch(`/trainers/${trainerId}/availability`));
}

export const CALENDAR_FILTERS = ["from", "to", "cityId", "courseId", "freeOnly"] as const;

/**
 * The availability calendar — the ASSIGNMENT SURFACE, not a report.
 *
 * Free/busy is computed per trainer over the window from committed sessions
 * plus declared leave, never stored. Naming a course also answers whether each
 * trainer is approved for it, which is the question the picker is really
 * asking: proposing someone who is not approved is refused at the batch.
 *
 * Not a page — the endpoint returns the whole window, already ordered as the
 * picker wants it: approved first, then free, then least committed.
 */
export async function getCalendar(params: SearchParams): Promise<CalendarEntry[]> {
  return z
    .array(calendarEntrySchema)
    .parse(await apiFetch(`/trainers/calendar${queryString(params, CALENDAR_FILTERS)}`));
}
