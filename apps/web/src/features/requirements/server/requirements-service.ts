import "server-only";
import { requirementSchema, type Page, type Requirement } from "@gurukulam/contracts";
import { apiFetch } from "@/server/api";
import { fetchPage, PAGE_KEYS, type SearchParams } from "@/server/list";

export const REQUIREMENT_FILTERS = [...PAGE_KEYS, "collegeId", "courseId", "status"] as const;

/**
 * The demand record that starts a college engagement. Confirming one is what
 * creates its dedicated batch (invariant 14), which is why a confirmed row
 * always carries the batch code it produced.
 */
export async function listRequirements(params: SearchParams): Promise<Page<Requirement>> {
  return fetchPage("/colleges/requirements", requirementSchema, params, REQUIREMENT_FILTERS);
}

/** One requirement, with the batch it produced if it has been confirmed. */
export async function getRequirement(requirementId: string): Promise<Requirement> {
  return requirementSchema.parse(await apiFetch(`/colleges/requirements/${requirementId}`));
}
