import { z } from "zod";

/**
 * Who is making the request. Built once by the auth guard and passed as the
 * first argument to every service method.
 *
 * Scope is applied INSIDE the service, never by the caller (invariant 11).
 * That rule matters more here than it did in the single-consumer design: a
 * third-party API key hitting /students traverses the same service as an
 * admin, so a scope filter applied at the controller would be missing on one
 * of those paths.
 */
export const actorTypeSchema = z.enum([
  "ADMIN_USER",
  "COLLEGE_USER",
  "TRAINER",
  "STUDENT",
  "API_CLIENT",
  "SYSTEM",
]);

export type ActorType = z.infer<typeof actorTypeSchema>;

export const permissionSchema = z.object({
  read: z.boolean(),
  edit: z.boolean(),
  delete: z.boolean(),
});

export type Permission = z.infer<typeof permissionSchema>;

/** The modules a permission set can name. Mirrors the nav rail. */
export const MODULES = [
  "dashboard",
  "colleges",
  "students",
  "courses",
  "batches",
  "trainers",
  "feeLedger",
  "hiring",
  "reports",
  "certificates",
  "notifications",
  "settings",
] as const;

export type ModuleName = (typeof MODULES)[number];

export const principalSchema = z.object({
  id: z.string(),
  name: z.string(),
  actor: actorTypeSchema,
  roleId: z.string().nullable(),
  roleName: z.string().nullable(),
  /**
   * null = global. Otherwise the city ids this principal may see. An empty
   * array is NOT the same as null — it means "scoped to nothing", which is
   * how a misconfigured account fails closed rather than open.
   */
  cityScope: z.array(z.string()).nullable(),
  /** Set for college portal users and college-scoped API clients. */
  collegeScope: z.string().nullable(),
  permissions: z.record(z.string(), permissionSchema),
});

export type Principal = z.infer<typeof principalSchema>;

export type Action = keyof Permission;

/** Whether this principal may perform `action` on `module`. */
export function can(principal: Principal, module: ModuleName, action: Action): boolean {
  return principal.permissions[module]?.[action] === true;
}

/**
 * Whether a city falls inside the principal's scope.
 *
 * A null cityScope is global. A row with no city is visible only to a global
 * principal — a scoped operator should not see records that could belong to
 * any region.
 */
export function isCityInScope(principal: Principal, cityId: string | null): boolean {
  if (principal.cityScope === null) return true;
  if (cityId === null) return false;
  return principal.cityScope.includes(cityId);
}

/** Whether a college falls inside the principal's scope. */
export function isCollegeInScope(principal: Principal, collegeId: string | null): boolean {
  if (principal.collegeScope === null) return true;
  return collegeId === principal.collegeScope;
}

/** A principal for internal work — the cron, migrations, system notifications. */
export const SYSTEM_PRINCIPAL: Principal = {
  id: "system",
  name: "System",
  actor: "SYSTEM",
  roleId: null,
  roleName: null,
  cityScope: null,
  collegeScope: null,
  permissions: Object.fromEntries(
    MODULES.map((m) => [m, { read: true, edit: true, delete: false }]),
  ),
};
