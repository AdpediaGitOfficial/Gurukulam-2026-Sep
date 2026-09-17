import { Injectable } from "@nestjs/common";
import type { ActorType, Principal } from "@gurukulam/contracts";
import { MODULES } from "@gurukulam/contracts";
import { PrismaService } from "../prisma/prisma.module";
import { ApiException } from "../../common/errors";

/**
 * Builds the Principal from a verified token subject.
 *
 * This runs on every authenticated request, so it reads the CURRENT role,
 * scope and account status rather than trusting what was baked into the token
 * at login. Revoking a permission or narrowing a city scope has to take effect
 * before the access token expires, or the JWT's lifetime becomes the lag on
 * every security change.
 */
@Injectable()
export class PrincipalService {
  constructor(private readonly prisma: PrismaService) {}

  async forActor(actor: ActorType, id: string): Promise<Principal> {
    switch (actor) {
      case "ADMIN_USER":
        return this.forAdmin(id);
      case "COLLEGE_USER":
        return this.forCollegeUser(id);
      case "TRAINER":
        return this.forTrainer(id);
      case "STUDENT":
        return this.forStudent(id);
      case "API_CLIENT":
        return this.forApiClient(id);
      default:
        throw ApiException.unauthenticated();
    }
  }

  private async forAdmin(id: string): Promise<Principal> {
    const user = await this.prisma.adminUser.findFirst({
      where: { adminUserId: id, deletedAt: null },
      include: { role: true },
    });
    if (!user) throw ApiException.unauthenticated();
    if (user.accountStatus !== "ACTIVE") throw ApiException.accountInactive();

    return {
      id: user.adminUserId,
      name: user.name,
      actor: "ADMIN_USER",
      roleId: user.roleId,
      roleName: user.role.name,
      // An EMPTY cityScope column means global. A populated one is a regional
      // sub-admin. The contract's `null` carries the global meaning, so the
      // translation happens here, once, rather than at every call site.
      cityScope: user.cityScope.length === 0 ? null : user.cityScope,
      collegeScope: null,
      permissions: asPermissions(user.role.permissions),
    };
  }

  private async forCollegeUser(id: string): Promise<Principal> {
    const user = await this.prisma.collegeUser.findFirst({
      where: { collegeUserId: id, deletedAt: null },
    });
    if (!user) throw ApiException.unauthenticated();
    if (user.accountStatus !== "ACTIVE") throw ApiException.accountInactive();
    // Access can be revoked without deleting the account; a revoked user must
    // stop working immediately, not at token expiry.
    if (user.accessStatus !== "GRANTED") throw ApiException.accountInactive();

    return {
      id: user.collegeUserId,
      name: user.name,
      actor: "COLLEGE_USER",
      roleId: null,
      roleName: "College user",
      // A college user is city-global and college-scoped: the same mechanism
      // as a regional sub-admin, with a different axis. Modelling it this way
      // now is what avoids a parallel permission system when the college
      // portal is built.
      cityScope: null,
      collegeScope: user.collegeId,
      permissions: asPermissions(user.permissions),
    };
  }

  private async forTrainer(id: string): Promise<Principal> {
    const trainer = await this.prisma.trainer.findFirst({
      where: { trainerId: id, deletedAt: null },
    });
    if (!trainer) throw ApiException.unauthenticated();
    if (trainer.accountStatus !== "ACTIVE") throw ApiException.accountInactive();

    return {
      id: trainer.trainerId,
      name: trainer.name,
      actor: "TRAINER",
      roleId: null,
      roleName: "Trainer",
      cityScope: null,
      collegeScope: null,
      // The trainer portal is deferred. Credentials exist and the actor type
      // resolves, but it carries no module permissions until that portal
      // defines them — so a trainer token cannot read the admin console's
      // endpoints in the meantime.
      permissions: {},
    };
  }

  private async forStudent(id: string): Promise<Principal> {
    const student = await this.prisma.student.findFirst({
      where: { studentId: id, deletedAt: null },
    });
    if (!student) throw ApiException.unauthenticated();
    if (student.accountStatus !== "ACTIVE") throw ApiException.accountInactive();

    return {
      id: student.studentId,
      name: [student.firstName, student.lastName].filter(Boolean).join(" "),
      actor: "STUDENT",
      roleId: null,
      roleName: "Student",
      cityScope: null,
      collegeScope: null,
      permissions: {},
    };
  }

  private async forApiClient(id: string): Promise<Principal> {
    const client = await this.prisma.apiClient.findFirst({
      where: { apiClientId: id, deletedAt: null },
    });
    if (!client) throw ApiException.unauthenticated();
    if (client.expiresAt && client.expiresAt < new Date()) throw ApiException.unauthenticated();

    return {
      id: client.apiClientId,
      name: client.name,
      actor: "API_CLIENT",
      roleId: null,
      roleName: "API client",
      cityScope: client.cityScope.length === 0 ? null : client.cityScope,
      collegeScope: client.collegeScope,
      permissions: asPermissions(client.permissions),
    };
  }
}

/**
 * Narrows the stored JSON to the permission map.
 *
 * Anything malformed becomes "no permission" rather than throwing, so a bad
 * row in `roles` locks an operator out of a module instead of taking the whole
 * API down — and never the other way around.
 */
function asPermissions(raw: unknown): Record<string, { read: boolean; edit: boolean; delete: boolean }> {
  const out: Record<string, { read: boolean; edit: boolean; delete: boolean }> = {};
  if (typeof raw !== "object" || raw === null) return out;

  for (const [module, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!(MODULES as readonly string[]).includes(module)) continue;
    if (typeof value !== "object" || value === null) continue;
    const v = value as Record<string, unknown>;
    out[module] = {
      read: v.read === true,
      edit: v.edit === true,
      delete: v.delete === true,
    };
  }
  return out;
}
