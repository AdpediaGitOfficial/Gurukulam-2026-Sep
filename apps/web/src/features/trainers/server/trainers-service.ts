import "server-only";

import {
  trainerDetailSchema,
  trainerSchema,
  type Page,
  type Trainer,
  type TrainerDetail,
} from "@gurukulam/contracts";

import { apiFetch } from "@/server/api";
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

/** One trainer with the courses they are approved to deliver. */
export async function getTrainer(trainerId: string): Promise<TrainerDetail> {
  return trainerDetailSchema.parse(await apiFetch(`/trainers/${trainerId}`));
}
