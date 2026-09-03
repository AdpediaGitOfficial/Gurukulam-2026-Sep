import { Injectable } from "@nestjs/common";
import { Prisma } from "@gurukulam/db";
import { randomBytes } from "node:crypto";
import { MODULES } from "@gurukulam/contracts";
import type {
  AdminUser, AdminUserQuery, CreateAdminUserInput, CreateRoleInput,
  IssuedAdminCredential, Page, Principal, Role, RoleQuery,
  UpdateAdminUserInput, UpdateRoleInput,
} from "@gurukulam/contracts";
import { PrismaService } from "../prisma/prisma.module";
import { ApiException } from "../../common/errors";
import { liveOnly } from "../../common/scope/scope";
import { listPage, orderBy, paginate } from "../../common/scope/pagination";
import { hashPassword } from "../auth/password";

/**
 * Roles and the permission matrix.
 *
 * A role is not a label: it is the coarse gate every module checks. Two rules
 * follow from that and are enforced below.
 *
 * **Nobody may grant permissions they do not hold.** Without this, "edit
 * settings" quietly means "become a Super Admin" — an operator writes
 * themselves a role with everything on and assigns it to themselves. The
 * escalation is invisible in a diff and complete in one request.
 *
 * **A system role may be reshaped but never deleted.** Deleting Super Admin
 * leaves nobody able to restore it.
 */
@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(_p: Principal, query: RoleQuery): Promise<Page<Role>> {
    const where: Prisma.RoleWhereInput = {
      ...liveOnly(query.includeDeleted),
      ...(query.q ? { name: { contains: query.q, mode: "insensitive" } } : {}),
    };

    return listPage(query, async () => {
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.role.findMany({
          where,
          orderBy: orderBy(query, ["name", "createdAt"] as const, "name"),
          ...paginate(query),
          include: { _count: { select: { adminUsers: { where: { deletedAt: null } } } } },
        }),
        this.prisma.role.count({ where }),
      ]);
      return [rows.map(toRole), total];
    });
  }

  async get(_p: Principal, roleId: string): Promise<Role> {
    const role = await this.prisma.role.findFirst({
      where: { roleId, deletedAt: null },
      include: { _count: { select: { adminUsers: { where: { deletedAt: null } } } } },
    });
    if (!role) throw ApiException.notFound("Role");
    return toRole(role);
  }

  async create(principal: Principal, input: CreateRoleInput): Promise<Role> {
    this.assertMayGrant(principal, input.permissions);

    const clash = await this.prisma.role.findFirst({
      where: { name: { equals: input.name, mode: "insensitive" }, deletedAt: null },
      select: { roleId: true },
    });
    if (clash) throw ApiException.conflict("A role with that name exists", { name: "Already in use" });

    const role = await this.prisma.role.create({
      data: {
        name: input.name,
        description: input.description || null,
        permissions: normalise(input.permissions),
        createdBy: principal.id,
      },
      include: { _count: { select: { adminUsers: { where: { deletedAt: null } } } } },
    });
    return toRole(role);
  }

  async update(principal: Principal, roleId: string, input: UpdateRoleInput): Promise<Role> {
    const existing = await this.prisma.role.findFirst({ where: { roleId, deletedAt: null } });
    if (!existing) throw ApiException.notFound("Role");
    if (input.permissions) this.assertMayGrant(principal, input.permissions);

    // Editing the role you currently hold is how an operator widens their own
    // access without ever touching their own record (invariant 19's spirit).
    if (existing.roleId === principal.roleId && input.permissions) {
      throw ApiException.forbidden(
        "You cannot change the permissions of the role you hold. Ask another Super Admin.",
      );
    }

    const role = await this.prisma.role.update({
      where: { roleId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.permissions !== undefined ? { permissions: normalise(input.permissions) } : {}),
      },
      include: { _count: { select: { adminUsers: { where: { deletedAt: null } } } } },
    });
    return toRole(role);
  }

  async remove(principal: Principal, roleId: string): Promise<void> {
    const role = await this.prisma.role.findFirst({
      where: { roleId, deletedAt: null },
      include: { _count: { select: { adminUsers: { where: { deletedAt: null } } } } },
    });
    if (!role) throw ApiException.notFound("Role");

    if (role.isSystem) {
      throw ApiException.conflict(
        "A system role cannot be deleted — nobody would be able to restore it. Reshape it instead.",
      );
    }
    if (role.roleId === principal.roleId) {
      throw ApiException.forbidden("You cannot delete the role you hold.");
    }
    if (role._count.adminUsers > 0) {
      throw ApiException.conflict(
        `${role._count.adminUsers} operator${role._count.adminUsers === 1 ? " holds" : "s hold"} ` +
          "this role. Reassign them first.",
      );
    }

    await this.prisma.role.update({
      where: { roleId },
      data: { deletedAt: new Date(), deletedBy: principal.id },
    });
  }

  /**
   * Refuses a permission set that exceeds the granting principal's own.
   *
   * This is the escalation guard. Without it, an operator with `settings:edit`
   * writes a role holding everything and assigns it — complete privilege
   * escalation in one request, from a permission that sounds administrative
   * rather than dangerous.
   */
  private assertMayGrant(principal: Principal, permissions: Record<string, unknown>): void {
    const exceeded: string[] = [];

    for (const [module, value] of Object.entries(permissions)) {
      const wanted = value as { read?: boolean; edit?: boolean; delete?: boolean };
      const held = principal.permissions[module];
      for (const action of ["read", "edit", "delete"] as const) {
        if (wanted[action] === true && held?.[action] !== true) {
          exceeded.push(`${module}:${action}`);
        }
      }
    }

    if (exceeded.length > 0) {
      throw ApiException.forbidden(
        `You cannot grant permissions you do not hold yourself: ${exceeded.join(", ")}.`,
      );
    }
  }
}

/**
 * Administrators.
 *
 * Every guard here exists because this endpoint is the one that can lock an
 * organisation out of its own system, or quietly hand someone the keys.
 */
@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(principal: Principal, query: AdminUserQuery): Promise<Page<AdminUser>> {
    const where: Prisma.AdminUserWhereInput = {
      ...liveOnly(query.includeDeleted),
      ...(query.roleId ? { roleId: query.roleId } : {}),
      ...(query.accountStatus ? { accountStatus: query.accountStatus } : {}),
      ...(query.cityId ? { cityScope: { has: query.cityId } } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: "insensitive" } },
              { email: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    return listPage(query, async () => {
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.adminUser.findMany({
          where,
          orderBy: orderBy(query, ["name", "createdAt"] as const, "name"),
          ...paginate(query),
          include: { role: { select: { name: true } } },
        }),
        this.prisma.adminUser.count({ where }),
      ]);
      return [await Promise.all(rows.map((r) => this.decorate(r))), total] as [AdminUser[], number];
    });
  }

  async get(_p: Principal, adminUserId: string): Promise<AdminUser> {
    const user = await this.prisma.adminUser.findFirst({
      where: { adminUserId, deletedAt: null },
      include: { role: { select: { name: true } } },
    });
    if (!user) throw ApiException.notFound("Administrator");
    return this.decorate(user);
  }

  async create(principal: Principal, input: CreateAdminUserInput): Promise<IssuedAdminCredential> {
    await this.assertRoleAssignable(principal, input.roleId);
    this.assertScopeWithinOwn(principal, input.cityScope);
    await this.assertCitiesExist(input.cityScope);

    const clash = await this.prisma.adminUser.findFirst({
      where: { email: { equals: input.email, mode: "insensitive" }, deletedAt: null },
      select: { adminUserId: true },
    });
    if (clash) throw ApiException.conflict("That email is already in use", { email: "Already in use" });

    const temporaryPassword = randomBytes(9).toString("base64url");
    const user = await this.prisma.adminUser.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone || null,
        roleId: input.roleId,
        cityScope: input.cityScope,
        passwordHash: hashPassword(temporaryPassword),
        mustReset: true,
        createdBy: principal.id,
      },
    });

    return {
      adminUserId: user.adminUserId,
      email: user.email,
      // Returned once. Only the hash is kept — a credential that can be
      // re-read is one an operator can leak without knowing.
      temporaryPassword,
      mustResetPassword: true,
    };
  }

  async update(principal: Principal, adminUserId: string, input: UpdateAdminUserInput) {
    const target = await this.prisma.adminUser.findFirst({
      where: { adminUserId, deletedAt: null },
    });
    if (!target) throw ApiException.notFound("Administrator");

    const touchesPrivilege =
      input.roleId !== undefined ||
      input.cityScope !== undefined ||
      input.accountStatus !== undefined;

    // Invariant 19, stated exactly: an operator cannot edit their own role,
    // scope or identity. Those are Super-Admin fields, and the account screen
    // is read-only for the same reason.
    if (target.adminUserId === principal.id && touchesPrivilege) {
      throw ApiException.forbidden(
        "You cannot change your own role, region scope or account status. " +
          "Another Super Admin must do it.",
      );
    }

    if (input.roleId !== undefined) await this.assertRoleAssignable(principal, input.roleId);
    if (input.cityScope !== undefined) {
      this.assertScopeWithinOwn(principal, input.cityScope);
      await this.assertCitiesExist(input.cityScope);
    }

    // Demoting or suspending the last Super Admin leaves nobody able to undo
    // it. The check is on the effect, not the intent.
    if (input.roleId !== undefined || input.accountStatus !== undefined) {
      const losesSuperAdmin =
        (input.roleId !== undefined && input.roleId !== target.roleId) ||
        (input.accountStatus !== undefined && input.accountStatus !== "ACTIVE");
      if (losesSuperAdmin) await this.assertNotLastSuperAdmin(target);
    }

    const user = await this.prisma.adminUser.update({
      where: { adminUserId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
        ...(input.roleId !== undefined ? { roleId: input.roleId } : {}),
        ...(input.cityScope !== undefined ? { cityScope: input.cityScope } : {}),
        ...(input.accountStatus !== undefined ? { accountStatus: input.accountStatus } : {}),
      },
      include: { role: { select: { name: true } } },
    });

    // A narrowed scope or a changed role must bite now. The principal is
    // rebuilt per request so access is already correct, but an existing
    // session should not outlive a suspension.
    if (input.accountStatus !== undefined && input.accountStatus !== "ACTIVE") {
      await this.prisma.refreshToken.updateMany({
        where: { actorType: "ADMIN_USER", actorId: adminUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return this.decorate(user);
  }

  /** Issues a fresh temporary password. Kills every existing session. */
  async resetPassword(principal: Principal, adminUserId: string): Promise<IssuedAdminCredential> {
    const target = await this.prisma.adminUser.findFirst({
      where: { adminUserId, deletedAt: null },
    });
    if (!target) throw ApiException.notFound("Administrator");

    const temporaryPassword = randomBytes(9).toString("base64url");
    await this.prisma.$transaction(async (tx) => {
      await tx.adminUser.update({
        where: { adminUserId },
        data: { passwordHash: hashPassword(temporaryPassword), mustReset: true },
      });
      await tx.refreshToken.updateMany({
        where: { actorType: "ADMIN_USER", actorId: adminUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    void principal;
    return { adminUserId, email: target.email, temporaryPassword, mustResetPassword: true };
  }

  async remove(principal: Principal, adminUserId: string): Promise<void> {
    const target = await this.prisma.adminUser.findFirst({
      where: { adminUserId, deletedAt: null },
    });
    if (!target) throw ApiException.notFound("Administrator");

    // Deleting yourself ends your own session mid-request and leaves the
    // organisation one operator short with nobody having decided that.
    if (target.adminUserId === principal.id) {
      throw ApiException.forbidden("You cannot delete your own account.");
    }
    await this.assertNotLastSuperAdmin(target);

    await this.prisma.$transaction(async (tx) => {
      await tx.adminUser.update({
        where: { adminUserId },
        data: { deletedAt: new Date(), deletedBy: principal.id, accountStatus: "INACTIVE" },
      });
      await tx.refreshToken.updateMany({
        where: { actorType: "ADMIN_USER", actorId: adminUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  /**
   * A scoped operator cannot hand out reach they do not have — including
   * GLOBAL scope, which an empty list means.
   */
  private assertScopeWithinOwn(principal: Principal, cityScope: string[]): void {
    if (principal.cityScope === null) return; // global may grant anything

    if (cityScope.length === 0) {
      throw ApiException.forbidden(
        "You are scoped to specific regions and cannot grant global access.",
      );
    }
    const outside = cityScope.filter((c) => !principal.cityScope!.includes(c));
    if (outside.length > 0) {
      throw ApiException.forbidden(
        `You cannot grant access to ${outside.length} region${outside.length === 1 ? "" : "s"} outside your own.`,
      );
    }
  }

  /** Assigning a role whose permissions exceed your own is escalation by proxy. */
  private async assertRoleAssignable(principal: Principal, roleId: string): Promise<void> {
    const role = await this.prisma.role.findFirst({ where: { roleId, deletedAt: null } });
    if (!role) throw ApiException.validation({ roleId: "That role no longer exists" });

    const permissions = role.permissions as Record<string, Record<string, boolean>>;
    const exceeded: string[] = [];
    for (const [module, actions] of Object.entries(permissions ?? {})) {
      for (const action of ["read", "edit", "delete"] as const) {
        if (actions?.[action] === true && principal.permissions[module]?.[action] !== true) {
          exceeded.push(`${module}:${action}`);
        }
      }
    }
    if (exceeded.length > 0) {
      throw ApiException.forbidden(
        `That role holds permissions you do not: ${exceeded.slice(0, 6).join(", ")}` +
          `${exceeded.length > 6 ? `, and ${exceeded.length - 6} more` : ""}.`,
      );
    }
  }

  private async assertNotLastSuperAdmin(target: { adminUserId: string; roleId: string }): Promise<void> {
    const role = await this.prisma.role.findUnique({ where: { roleId: target.roleId } });
    if (!role) return;

    // "Super Admin" by capability rather than by name: a renamed role that
    // still holds settings:delete is just as load-bearing.
    const permissions = role.permissions as Record<string, Record<string, boolean>>;
    const isSuperAdmin = permissions?.settings?.delete === true;
    if (!isSuperAdmin) return;

    const remaining = await this.prisma.adminUser.count({
      where: {
        deletedAt: null,
        accountStatus: "ACTIVE",
        adminUserId: { not: target.adminUserId },
        role: { deletedAt: null, permissions: { path: ["settings", "delete"], equals: true } },
      },
    });

    if (remaining === 0) {
      throw ApiException.conflict(
        "This is the last active Super Admin. Removing or demoting them would leave nobody " +
          "able to restore access.",
      );
    }
  }

  private async assertCitiesExist(cityScope: string[]): Promise<void> {
    if (cityScope.length === 0) return;
    const found = await this.prisma.city.count({
      where: { cityId: { in: cityScope }, deletedAt: null },
    });
    if (found !== new Set(cityScope).size) {
      throw ApiException.validation({ cityScope: "One or more of those cities no longer exists" });
    }
  }

  private async decorate(row: {
    adminUserId: string; name: string; email: string; phone: string | null;
    roleId: string; cityScope: string[]; accountStatus: string; mustReset: boolean;
    photoUrl: string | null; lastLoginAt: Date | null; createdAt: Date; deletedAt: Date | null;
    role?: { name: string } | null;
  }): Promise<AdminUser> {
    const cityNames = row.cityScope.length
      ? (
          await this.prisma.city.findMany({
            where: { cityId: { in: row.cityScope } },
            select: { name: true },
          })
        ).map((c) => c.name)
      : [];

    return {
      adminUserId: row.adminUserId,
      name: row.name,
      email: row.email,
      phone: row.phone,
      roleId: row.roleId,
      roleName: row.role?.name ?? null,
      cityScope: row.cityScope,
      cityNames,
      accountStatus: row.accountStatus as AdminUser["accountStatus"],
      mustResetPassword: row.mustReset,
      photoUrl: row.photoUrl,
      lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      deletedAt: row.deletedAt?.toISOString() ?? null,
    };
    // password_hash is deliberately absent.
  }
}

/** Drops anything not in MODULES, so a typo cannot become a silent permission. */
function normalise(permissions: Record<string, unknown>): Prisma.InputJsonValue {
  const out: Record<string, { read: boolean; edit: boolean; delete: boolean }> = {};
  for (const module of MODULES) {
    const value = permissions[module] as Record<string, boolean> | undefined;
    if (!value) continue;
    out[module] = {
      read: value.read === true,
      edit: value.edit === true,
      delete: value.delete === true,
    };
  }
  return out;
}

function toRole(row: Prisma.RoleGetPayload<{ include: { _count: { select: { adminUsers: true } } } }>): Role {
  return {
    roleId: row.roleId,
    name: row.name,
    description: row.description,
    isSystem: row.isSystem,
    permissions: row.permissions as Role["permissions"],
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    operatorCount: row._count.adminUsers,
  };
}
