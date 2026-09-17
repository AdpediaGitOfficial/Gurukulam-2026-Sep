import { Injectable } from "@nestjs/common";
import type { Account, Principal, UpdateAccountInput } from "@gurukulam/contracts";
import { PrismaService } from "../prisma/prisma.module";
import { ApiException } from "../../common/errors";

/**
 * The account screen — PHOTO-ONLY, by design.
 *
 * Invariant 19: an operator cannot edit their own role, scope or identity.
 * Letting them would make the permission model advisory — a regional
 * sub-admin could widen their own region and nothing would stop them. Those
 * fields change under Settings › Administrators, by someone else.
 *
 * The contract names `editable: ["photoUrl"]` explicitly rather than leaving a
 * UI to infer why the rest is locked.
 */
@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  async get(principal: Principal): Promise<Account> {
    const cityNames = principal.cityScope?.length
      ? (
          await this.prisma.city.findMany({
            where: { cityId: { in: principal.cityScope } },
            select: { name: true },
          })
        ).map((c) => c.name)
      : [];

    const { photoUrl, lastLoginAt, mustReset } = await this.loadSelf(principal);

    return {
      id: principal.id,
      name: principal.name,
      email: await this.selfEmail(principal),
      actor: principal.actor,
      roleName: principal.roleName,
      cityScope: principal.cityScope,
      cityNames,
      collegeScope: principal.collegeScope,
      photoUrl,
      lastLoginAt: lastLoginAt?.toISOString() ?? null,
      mustResetPassword: mustReset,
      editable: ["photoUrl"],
    };
  }

  /**
   * The only field an operator may change about themselves.
   *
   * Deliberately not a partial update of the account: accepting a body with
   * name or roleId in it and silently ignoring them would leave an operator
   * believing a change took effect.
   */
  async update(principal: Principal, input: UpdateAccountInput): Promise<Account> {
    if (principal.actor !== "ADMIN_USER") {
      throw ApiException.forbidden("Only an operator account has a photo to change.");
    }
    await this.prisma.adminUser.update({
      where: { adminUserId: principal.id },
      data: { photoUrl: input.photoUrl },
    });
    return this.get(principal);
  }

  private async loadSelf(principal: Principal) {
    if (principal.actor === "ADMIN_USER") {
      const u = await this.prisma.adminUser.findUniqueOrThrow({
        where: { adminUserId: principal.id },
        select: { photoUrl: true, lastLoginAt: true, mustReset: true },
      });
      return u;
    }
    if (principal.actor === "COLLEGE_USER") {
      const u = await this.prisma.collegeUser.findUniqueOrThrow({
        where: { collegeUserId: principal.id },
        select: { lastLoginAt: true, mustReset: true },
      });
      return { photoUrl: null, ...u };
    }
    if (principal.actor === "STUDENT") {
      const u = await this.prisma.student.findUniqueOrThrow({
        where: { studentId: principal.id },
        select: { photoUrl: true, lastLoginAt: true, mustReset: true },
      });
      return u;
    }
    if (principal.actor === "TRAINER") {
      const u = await this.prisma.trainer.findUniqueOrThrow({
        where: { trainerId: principal.id },
        select: { photoUrl: true, mustReset: true },
      });
      return { ...u, lastLoginAt: null };
    }
    return { photoUrl: null, lastLoginAt: null, mustReset: false };
  }

  private async selfEmail(principal: Principal): Promise<string> {
    switch (principal.actor) {
      case "ADMIN_USER":
        return (await this.prisma.adminUser.findUniqueOrThrow({
          where: { adminUserId: principal.id }, select: { email: true },
        })).email;
      case "COLLEGE_USER": {
        const u = await this.prisma.collegeUser.findUniqueOrThrow({
          where: { collegeUserId: principal.id }, select: { email: true, loginEmail: true },
        });
        // The portal identity is what they signed in with, so it is what the
        // account screen should show back to them.
        return u.loginEmail ?? u.email;
      }
      case "STUDENT": {
        const u = await this.prisma.student.findUniqueOrThrow({
          where: { studentId: principal.id }, select: { email: true, loginEmail: true },
        });
        return u.loginEmail ?? u.email;
      }
      case "TRAINER":
        return (await this.prisma.trainer.findUniqueOrThrow({
          where: { trainerId: principal.id }, select: { email: true },
        })).email;
      default:
        return "";
    }
  }
}
