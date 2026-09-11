import type { Principal } from "@gurukulam/contracts";
import { ApiException } from "../errors";

/**
 * Scope, expressed as Prisma `where` fragments.
 *
 * Invariant 11: every scope is applied INSIDE the service, never by the
 * caller. These helpers exist so that applying it is shorter than forgetting
 * it — a service spreads one of these into its `where` and is correct, and a
 * reviewer can grep for the absence.
 *
 * The rule that is easy to get backwards: for a scoped principal, a row whose
 * city is NULL is NOT visible. `{ cityId: { in: [...] } }` excludes nulls in
 * SQL, which is the behaviour we want — a regional operator should not see
 * records that could belong to any region.
 */

/** True when this principal sees everything, on both axes. */
export const isGlobal = (principal: Principal): boolean =>
  principal.cityScope === null && principal.collegeScope === null;

/**
 * Restricts a query by the principal's city scope.
 *
 *     where: { ...live, ...cityScope(principal) }
 *
 * `field` names the column when it is not `cityId` — a batch scopes on its
 * own city, a student on theirs.
 */
export function cityScope(principal: Principal, field = "cityId"): Record<string, unknown> {
  if (principal.cityScope === null) return {};
  // An empty scope array means "scoped to nothing", and must match nothing
  // rather than everything. `{ in: [] }` is the correct SQL for that.
  return { [field]: { in: principal.cityScope } };
}

/** Restricts a query by the principal's college scope. */
export function collegeScope(principal: Principal, field = "collegeId"): Record<string, unknown> {
  if (principal.collegeScope === null) return {};
  return { [field]: principal.collegeScope };
}

/** Both axes at once, for the common case. */
export function scopeWhere(
  principal: Principal,
  fields: { city?: string | null; college?: string | null } = {},
): Record<string, unknown> {
  const { city = "cityId", college = "collegeId" } = fields;
  return {
    ...(city ? cityScope(principal, city) : {}),
    ...(college ? collegeScope(principal, college) : {}),
  };
}

/**
 * Guards a WRITE against scope.
 *
 * Reads are filtered by the fragments above, so an out-of-scope row simply
 * does not appear. A write is different: the caller already has the id, so the
 * service must check the row it fetched before touching it.
 *
 * Throws the 404 rather than a 403, because a 403 confirms that a record
 * exists in another region — which is itself the leak.
 */
export function assertInScope(
  principal: Principal,
  row: { cityId?: string | null; collegeId?: string | null },
): void {
  if (principal.cityScope !== null) {
    const city = row.cityId ?? null;
    if (city === null || !principal.cityScope.includes(city)) throw ApiException.outOfScope();
  }
  if (principal.collegeScope !== null) {
    if (row.collegeId !== principal.collegeScope) throw ApiException.outOfScope();
  }
}

/**
 * The soft-delete predicate (ADR 0002).
 *
 * `includeDeleted` is a deliberate opt-in: operational reads exclude removed
 * rows, and financial or historical reports include them because the events
 * they record still happened.
 */
export const liveOnly = (includeDeleted = false): { deletedAt?: null } =>
  includeDeleted ? {} : { deletedAt: null };
