import "server-only";

import { trainerSchema, type Page, type Trainer } from "@gurukulam/contracts";

import { fetchPage, PAGE_KEYS, type SearchParams } from "@/server/list";

export const TRAINER_FILTERS = [
  ...PAGE_KEYS,
  "cityId",
  "approvedForCourseId",
  "accountStatus",
] as const;

export async function listTrainers(params: SearchParams): Promise<Page<Trainer>> {
  return fetchPage("/trainers", trainerSchema, params, TRAINER_FILTERS);
}
