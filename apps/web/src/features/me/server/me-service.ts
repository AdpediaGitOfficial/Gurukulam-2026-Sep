import "server-only";

import {
  meAssignmentsSchema,
  meBatchSchema,
  meHomeSchema,
  meProfileSchema,
  meScheduleSchema,
  type MeBatch,
  type MeHome,
  type MeProfile,
  accountSchema,
  meFeesSchema,
  type Account,
  type MeAssignments,
  type MeFees,
  type MeSchedule,
} from "@gurukulam/contracts";
import { z } from "zod";

import { apiFetch, checkShape } from "@/server/api";

/**
 * The student portal's only seam onto data.
 *
 * Deliberately thin: `/me/*` already returns student-shaped contracts, so
 * there is nothing to project or filter here. That is the point of the API
 * having its own surface rather than the console's with a narrower scope — the
 * BFF has no opportunity to forget a field, because no field it should not
 * have ever arrives.
 *
 * Every response is checked against its contract for the same reason the
 * console checks its own: a server that started answering a different shape
 * should say so here, loudly, rather than render as a page of blanks.
 */

export async function getHome(): Promise<MeHome> {
  const home = await apiFetch<MeHome>("/me/home");
  checkShape(meHomeSchema, home, "GET /me/home");
  return home;
}

export async function getProfile(): Promise<MeProfile> {
  const profile = await apiFetch<MeProfile>("/me");
  checkShape(meProfileSchema, profile, "GET /me");
  return profile;
}

export async function listBatches(): Promise<MeBatch[]> {
  const batches = await apiFetch<MeBatch[]>("/me/batches");
  checkShape(z.array(meBatchSchema), batches, "GET /me/batches");
  return batches;
}

export async function getSchedule(): Promise<MeSchedule> {
  const schedule = await apiFetch<MeSchedule>("/me/schedule");
  checkShape(meScheduleSchema, schedule, "GET /me/schedule");
  return schedule;
}

/**
 * What is owed, and what has been paid.
 *
 * Answers for a college student too — `billedToCollege` rather than a refusal,
 * because the screen's honest answer is "your institution is billed for this"
 * and a refusal would render as an error.
 */
export async function getFees(): Promise<MeFees> {
  const fees = await apiFetch<MeFees>("/me/fees");
  checkShape(meFeesSchema, fees, "GET /me/fees");
  return fees;
}

/**
 * The signed-in account, as `/account` answers it for a student.
 *
 * Read here rather than through the settings feature's copy: a portal page
 * importing an admin module's service is the dependency rule running the wrong
 * way, and it is how the console's shapes end up on a student's screen. Same
 * endpoint, this portal's seam.
 */
export async function getMeAccount(): Promise<Account> {
  const account = await apiFetch<Account>("/account");
  checkShape(accountSchema, account, "GET /account");
  return account;
}

/**
 * The work set against this student's batches, split three ways.
 *
 * The split is the API's, not this file's, and deliberately so: "handed in"
 * has one definition in one place, rather than a filter per screen that the
 * home card and the assignments page could drift apart on.
 */
export async function getAssignments(): Promise<MeAssignments> {
  const assignments = await apiFetch<MeAssignments>("/me/assignments");
  checkShape(meAssignmentsSchema, assignments, "GET /me/assignments");
  return assignments;
}
