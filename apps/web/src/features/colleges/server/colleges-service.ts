import "server-only";

import { collegeSchema, type College, type Page } from "@gurukulam/contracts";

import { fetchPage, PAGE_KEYS, type SearchParams } from "@/server/list";

/** Filters this module accepts from the URL. Anything else is dropped. */
export const COLLEGE_FILTERS = [...PAGE_KEYS, "cityId", "discipline", "isActive"] as const;

/**
 * The only thing in this feature that knows where colleges come from.
 *
 * Scope is applied by the API, inside its own service (invariant 11). The
 * console never sends a scope filter — a client that could choose its own scope
 * would not be a scope.
 */
export async function listColleges(params: SearchParams): Promise<Page<College>> {
  return fetchPage("/colleges", collegeSchema, params, COLLEGE_FILTERS);
}
