import { z } from "zod";
import { pageQuerySchema } from "../common/page.js";
import { MODULES, permissionSchema } from "../common/principal.js";

/**
 * Access & identity management — roles, administrators, and the account
 * screen.
 *
 * This is the module that can lock an operator out of their own system, so
 * most of its rules are about what an operator may NOT do:
 *
 *   · Invariant 19 — nobody edits their own role, scope or identity. Those are
 *     Super-Admin fields, which is why the account screen is photo-only.
 *   · Nobody may grant a scope wider than their own, or permissions they do
 *     not themselves hold. Otherwise "edit administrators" quietly means
 *     "become a Super Admin".
 *   · The last Super Admin cannot be removed or demoted.
 */

export const permissionMatrixSchema = z.record(z.string(), permissionSchema);

export const roleSchema = z.object({
  roleId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  /** A system role is structural — it may be reshaped but never deleted. */
  isSystem: z.boolean(),
  permissions: permissionMatrixSchema,
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
  operatorCount: z.number().int().optional(),
});

export type Role = z.infer<typeof roleSchema>;

export const roleQuerySchema = pageQuerySchema;
export type RoleQuery = z.infer<typeof roleQuerySchema>;

/**
 * Only the modules the contract knows about, and every one optional.
 *
 * `z.record` with an enum key demands EVERY member be present, which would
 * force a caller to spell out "no access" for a dozen modules to grant one.
 * An omitted module means no access. An UNRECOGNISED one is refused rather
 * than dropped: an operator who wrote "dashbord" believes they granted
 * dashboard access, and silently discarding it leaves them wrong with no
 * signal. The service normalises the matrix as well, as a second line of
 * defence.
 */
const moduleMatrix = z
  .partialRecord(z.enum(MODULES), permissionSchema)
  .describe("Permission per module. An omitted module means no access.");

export const createRoleSchema = z.object({
  name: z.string().trim().min(1, "Give the role a name").max(80),
  description: z.string().trim().max(400).optional(),
  permissions: moduleMatrix,
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(400).optional(),
  permissions: moduleMatrix.optional(),
});

export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

// ── Administrators ────────────────────────────────────────────────────────

export const adminUserSchema = z.object({
  adminUserId: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  roleId: z.string(),
  roleName: z.string().nullable().optional(),
  /** Empty means global. A populated list is a regional sub-admin. */
  cityScope: z.array(z.string()),
  cityNames: z.array(z.string()).optional(),
  accountStatus: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
  mustResetPassword: z.boolean(),
  photoUrl: z.string().nullable(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
});

export type AdminUser = z.infer<typeof adminUserSchema>;

export const adminUserQuerySchema = pageQuerySchema.extend({
  roleId: z.string().optional(),
  cityId: z.string().optional(),
  accountStatus: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional(),
});

export type AdminUserQuery = z.infer<typeof adminUserQuerySchema>;

export const createAdminUserSchema = z.object({
  name: z.string().trim().min(1, "Enter their name").max(160),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  phone: z.string().trim().max(24).optional(),
  roleId: z.string().min(1, "Assign a role"),
  /**
   * Empty grants GLOBAL scope, which is a deliberate act — a scoped operator
   * is refused it, because they cannot hand out reach they do not have.
   */
  cityScope: z.array(z.string()).max(200).default([]),
});

export type CreateAdminUserInput = z.infer<typeof createAdminUserSchema>;

export const updateAdminUserSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  phone: z.string().trim().max(24).optional(),
  roleId: z.string().optional(),
  cityScope: z.array(z.string()).max(200).optional(),
  accountStatus: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional(),
});

export type UpdateAdminUserInput = z.infer<typeof updateAdminUserSchema>;

/** Returned once on creation or reset. Only the hash is stored. */
export const issuedAdminCredentialSchema = z.object({
  adminUserId: z.string(),
  email: z.string(),
  temporaryPassword: z.string(),
  mustResetPassword: z.literal(true),
});

export type IssuedAdminCredential = z.infer<typeof issuedAdminCredentialSchema>;

// ── Account (invariant 19) ────────────────────────────────────────────────

/**
 * The account screen is PHOTO-ONLY.
 *
 * Name, email, role and region scope are read-only here by design: letting an
 * operator edit their own scope would make the permission model advisory. They
 * are changed by a Super Admin under Settings › Administrators.
 */
export const accountSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  actor: z.string(),
  roleName: z.string().nullable(),
  cityScope: z.array(z.string()).nullable(),
  cityNames: z.array(z.string()).optional(),
  collegeScope: z.string().nullable(),
  photoUrl: z.string().nullable(),
  lastLoginAt: z.string().nullable(),
  mustResetPassword: z.boolean(),
  /** Spelled out so the UI does not have to infer why the fields are locked. */
  editable: z.array(z.literal("photoUrl")),
});

export type Account = z.infer<typeof accountSchema>;

/**
 * STRICT on purpose.
 *
 * Zod strips unknown keys by default, so a body carrying `roleId` or
 * `cityScope` would be accepted with a 200 and those fields quietly discarded
 * — leaving an operator believing they had changed their own scope. Refusing
 * the request says plainly that the field is not theirs to set.
 */
export const updateAccountSchema = z
  .object({
    photoUrl: z.string().url("Enter a valid URL").nullable(),
  })
  // .strict() takes no message in Zod 4; the refusal reads "Unrecognized key",
  // which is precise enough — the field simply is not theirs to set.
  .strict();

export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
