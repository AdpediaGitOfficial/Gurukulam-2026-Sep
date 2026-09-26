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
  // Requirements sit under Colleges in the nav, but carry their OWN
  // permission: a college portal user must be able to raise one without
  // thereby gaining edit rights over their institution's record.
  "requirements",
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
  /**
   * The third axis, and the only one that is DERIVED rather than stored.
   *
   * City and college scope are columns: a row is in scope when its column
   * matches. A trainer's scope is a relationship — the batches they are
   * primary trainer of, or hold a live CONFIRMED assignment to — so this
   * carries their id and the services traverse from it. See `trainerScope` in
   * `common/scope/scope.ts`.
   *
   * Derived means it moves underneath them: a trainer released from a batch
   * loses the roster at the moment of release. Their history does not vanish —
   * they delivered those sessions — so reading and writing are deliberately
   * different sets. Both live in the same file for that reason.
   */
  trainerScope: z.string().nullable(),
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

/**
 * What a trainer may touch, as a fixed matrix rather than a stored role.
 *
 * ── Why it is fixed ────────────────────────────────────────────────────
 *
 * An admin's permissions come from a role somebody configured; a trainer's do
 * not, because there is one kind of trainer. Storing it would mean a screen to
 * edit it and a way to get it wrong, for a set that has exactly one correct
 * value.
 *
 * ── What is absent, and why ────────────────────────────────────────────
 *
 * `feeLedger`, `hiring`, `colleges`, `reports` and `settings` do not appear at
 * all — a trainer has no business in any of them, and absent is stronger than
 * false because `can()` reads a missing module as no. `students` is absent
 * too: a trainer reaches a student through a roster (there is no flat student
 * list they could be shown), and `batches` read is what authorises that.
 *
 * `certificates` is read-only: a trainer needs to know whether a cohort is
 * below its attendance floor, and must not be able to issue anything.
 *
 * `courses` is absent too, and that one is a deliberate divergence from
 * `trainer-portal-plan.md` §2.2. It recommends a projection that strips
 * commercial fields from every mapper a trainer reaches — which is right when
 * the module is needed. Here the only such field in the whole reachable
 * surface is `courses.standardMarketValueMinor`, and a trainer does not need
 * the courses module at all: the course NAME already rides on every batch, and
 * the attendance floor rides on their own batch shape. Removing the module is
 * stronger than filtering it, because there is then nothing to forget.
 *
 * Nothing carries `delete`. Removing a batch, a session or a student is an
 * operations act with consequences a trainer cannot see.
 */
export const TRAINER_PERMISSIONS: Record<string, Permission> = {
  dashboard: { read: true, edit: false, delete: false },
  batches: { read: true, edit: true, delete: false },
  trainers: { read: true, edit: true, delete: false },
  certificates: { read: true, edit: false, delete: false },
  notifications: { read: true, edit: true, delete: false },
};

/**
 * The same matrix with every `edit` withdrawn.
 *
 * A SUSPENDED trainer keeps their confirmed batches — pulling somebody off
 * live delivery as a side effect of a status change would strand those cohorts
 * — but must not write anything more. They sign in and read, because a trainer
 * who cannot see the sessions they are still nominally teaching will simply
 * not turn up.
 *
 * Expressed through the existing matrix rather than a new `readOnly` flag, so
 * every `@RequirePermission(…, "edit")` in the product refuses them without
 * being told about suspension at all.
 */
export const TRAINER_READ_ONLY: Record<string, Permission> = Object.fromEntries(
  Object.entries(TRAINER_PERMISSIONS).map(([module, permission]) => [
    module,
    { ...permission, edit: false, delete: false },
  ]),
);

/**
 * What a college portal login may reach, as a fixed matrix.
 *
 * ── Why it is fixed, when the column is not ────────────────────────────
 *
 * `college_users.permissions` is a JSON column and the principal builder reads
 * it, so a narrower account remains possible — §3.6 of the admin plan wanted
 * "setting what their college can do". There is no screen for that and there is
 * one kind of college user, so this is what `grant()` writes: one canonical set
 * with a reason attached, rather than an object literal buried in a service.
 *
 * ── What is absent, and why ───────────────────────────────────────────
 *
 * `dashboard` USED to be here, and that was the most expensive entry in the
 * set. Every row-derived figure on the operator dashboard is scoped correctly —
 * but the screen also reports how many trainers we have, how large the question
 * bank is, how many courses are in the catalogue, the bench-to-stretched
 * utilisation spread, the names of the trainers carrying the most delivery, and
 * an operator queue. None of those are derived from a scoped row, so scope had
 * nothing to filter them by and they came out whole. The institution gets its
 * own home instead, computed from its own rows.
 *
 * `feeLedger` is absent although the college is the PAYER (invariant 3),
 * because that module is the per-STUDENT ledger — a college student has no
 * individual ledger at all, and the institution's own billing runs through its
 * contract. Its portal reads that through its own surface.
 *
 * `courses`, `trainers`, `hiring`, `reports` and `settings` do not appear:
 * absent is stronger than `false`, because `can()` reads a missing module as
 * no.
 *
 * ── What `edit` means where it appears ────────────────────────────────
 *
 * `students` edit: adding their own intake, correcting it, and putting it on
 * their own cohort. NOT suspending an account, ending an enrolment, or
 * recording how somebody's time on a batch went.
 *
 * `requirements` edit: raising one, and amending it while it is still a
 * request. NOT confirming, declining or closing it — those are ours.
 *
 * `certificates` edit: submitting the list of names they believe are finished.
 * NOT issuing, revoking, deciding a row on that list, or releasing it.
 *
 * Module-and-action is too coarse to say any of that, so it does not try. Each
 * of those acts calls `assertOursToDecide` in its own service, and
 * `college-acts.test.ts` pins them.
 *
 * Nothing carries `delete`.
 */
export const COLLEGE_PERMISSIONS: Record<string, Permission> = {
  colleges: { read: true, edit: false, delete: false },
  requirements: { read: true, edit: true, delete: false },
  students: { read: true, edit: true, delete: false },
  batches: { read: true, edit: false, delete: false },
  certificates: { read: true, edit: true, delete: false },
};

/** A principal for internal work — the cron, migrations, system notifications. */
export const SYSTEM_PRINCIPAL: Principal = {
  id: "system",
  name: "System",
  actor: "SYSTEM",
  roleId: null,
  roleName: null,
  cityScope: null,
  collegeScope: null,
  trainerScope: null,
  permissions: Object.fromEntries(
    MODULES.map((m) => [m, { read: true, edit: true, delete: false }]),
  ),
};
