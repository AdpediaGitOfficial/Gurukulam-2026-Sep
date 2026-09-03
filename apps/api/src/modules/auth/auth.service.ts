import { Inject, Injectable, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type {
  ChangePasswordInput,
  LoginInput,
  Principal,
  Session,
  TokenPair,
} from "@gurukulam/contracts";
import type { ActorType } from "@gurukulam/db";
import { ENV, type Env } from "../../config/env";
import { ApiException } from "../../common/errors";
import { PrismaService } from "../prisma/prisma.module";
import { LockoutService } from "./lockout.service";
import { PrincipalService } from "./principal.service";
import { hashPassword, hashToken, needsRehash, newOpaqueToken, verifyPassword } from "./password";

interface Credential {
  id: string;
  passwordHash: string | null;
  mustReset: boolean;
  active: boolean;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly lockout: LockoutService,
    private readonly principals: PrincipalService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async login(input: LoginInput, context: { userAgent?: string; ip?: string }): Promise<Session> {
    const { email, password, actor } = input;

    const status = await this.lockout.check(actor, email);
    if (status.locked) throw ApiException.accountLocked(status.retryAfterSeconds);

    const credential = await this.findCredential(actor, email);

    // A missing account still runs a hash, so the response takes the same time
    // whether or not the address exists. Skipping it turns login latency into
    // an account-enumeration oracle even though the message is identical.
    const storedHash = credential?.passwordHash ?? DUMMY_HASH;
    const passwordMatches = verifyPassword(password, storedHash);

    if (!credential || !credential.passwordHash || !passwordMatches) {
      const after = await this.lockout.recordFailure(actor, email);
      if (after.locked) throw ApiException.accountLocked(after.retryAfterSeconds);
      throw ApiException.invalidCredentials();
    }

    if (!credential.active) throw ApiException.accountInactive();

    await this.lockout.clear(actor, email);

    // Opportunistic upgrade: the seed writes a weaker scrypt form, and raising
    // the cost parameters later should not require a password reset.
    if (needsRehash(credential.passwordHash)) {
      await this.updatePasswordHash(actor, credential.id, hashPassword(password));
    }

    const principal = await this.principals.forActor(actor, credential.id);
    const tokens = await this.issueTokens(principal, {
      deviceLabel: input.deviceLabel,
      userAgent: context.userAgent,
      ip: context.ip,
    });

    await this.recordLogin(actor, credential.id);

    return { tokens, principal, mustResetPassword: credential.mustReset };
  }

  /**
   * Rotates a refresh token: the presented token is revoked and a new one
   * issued in the same transaction.
   *
   * If a token that was ALREADY rotated is presented, that means a copy leaked
   * — the legitimate holder has one token, so two uses is two holders. The
   * whole chain is revoked rather than just refusing the request, because
   * refusing would leave the thief's newer token working.
   */
  async refresh(refreshToken: string, context: { userAgent?: string; ip?: string }): Promise<Session> {
    const tokenHash = hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored) throw ApiException.unauthenticated();

    if (stored.revokedAt) {
      this.logger.warn(
        `Refresh token reuse detected for ${stored.actorType} ${stored.actorId} — revoking all sessions`,
      );
      await this.revokeAllFor(stored.actorType, stored.actorId);
      throw ApiException.tokenReused();
    }

    if (stored.expiresAt < new Date()) throw ApiException.tokenExpired();

    const principal = await this.principals.forActor(stored.actorType, stored.actorId);
    const replacement = await this.issueTokens(
      principal,
      {
        deviceLabel: stored.deviceLabel ?? undefined,
        userAgent: context.userAgent,
        ip: context.ip,
      },
      stored.refreshTokenId,
    );

    return { tokens: replacement, principal, mustResetPassword: false };
  }

  /** Ends one session. Signing out of a phone leaves the console signed in. */
  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Ends every session for an actor. */
  async revokeAllFor(actorType: ActorType, actorId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { actorType, actorId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async changePassword(principal: Principal, input: ChangePasswordInput): Promise<void> {
    const credential = await this.findCredentialById(principal.actor, principal.id);
    if (!credential?.passwordHash || !verifyPassword(input.currentPassword, credential.passwordHash)) {
      throw ApiException.validation({ currentPassword: "That is not your current password" });
    }

    await this.updatePasswordHash(principal.actor, principal.id, hashPassword(input.newPassword), false);

    // Every other session dies with the old password. A password change is
    // usually a response to a suspected compromise, and leaving other devices
    // signed in would defeat it.
    await this.revokeAllFor(principal.actor as ActorType, principal.id);
  }

  // ── Token issue ─────────────────────────────────────────────────────────

  private async issueTokens(
    principal: Principal,
    context: { deviceLabel?: string; userAgent?: string; ip?: string },
    rotatesFrom?: string,
  ): Promise<TokenPair> {
    // expiresIn is given in seconds rather than as "15m": the string form is
    // typed against `ms`'s template literals, and a number is unambiguous.
    const accessTtlSeconds = Math.floor(parseDuration(this.env.JWT_ACCESS_TTL) / 1000);
    const accessToken = await this.jwt.signAsync(
      { sub: principal.id, actor: principal.actor },
      { secret: this.env.JWT_ACCESS_SECRET, expiresIn: accessTtlSeconds },
    );

    // The refresh token is a random opaque value, not a JWT: it must be
    // revocable, and a self-contained token cannot be revoked without a
    // lookup — at which point the lookup is the source of truth anyway.
    const refreshToken = newOpaqueToken();
    const expiresAt = new Date(Date.now() + parseDuration(this.env.JWT_REFRESH_TTL));

    await this.prisma.$transaction(async (tx) => {
      const created = await tx.refreshToken.create({
        data: {
          actorType: principal.actor as ActorType,
          actorId: principal.id,
          tokenHash: hashToken(refreshToken),
          deviceLabel: context.deviceLabel ?? null,
          userAgent: context.userAgent?.slice(0, 400) ?? null,
          ipAddress: context.ip ?? null,
          expiresAt,
        },
      });

      if (rotatesFrom) {
        await tx.refreshToken.update({
          where: { refreshTokenId: rotatesFrom },
          data: { revokedAt: new Date(), replacedById: created.refreshTokenId },
        });
      }
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: accessTtlSeconds,
      tokenType: "Bearer",
    };
  }

  // ── Per-actor credential lookup ─────────────────────────────────────────

  private async findCredential(actor: LoginInput["actor"], email: string): Promise<Credential | null> {
    const where = { email: { equals: email, mode: "insensitive" as const }, deletedAt: null };

    switch (actor) {
      case "ADMIN_USER": {
        const u = await this.prisma.adminUser.findFirst({ where });
        return u && { id: u.adminUserId, passwordHash: u.passwordHash, mustReset: u.mustReset, active: u.accountStatus === "ACTIVE" };
      }
      case "COLLEGE_USER": {
        const u = await this.prisma.collegeUser.findFirst({ where });
        return u && {
          id: u.collegeUserId,
          passwordHash: u.passwordHash,
          mustReset: u.mustReset,
          active: u.accountStatus === "ACTIVE" && u.accessStatus === "GRANTED",
        };
      }
      case "TRAINER": {
        const u = await this.prisma.trainer.findFirst({ where });
        return u && { id: u.trainerId, passwordHash: u.passwordHash, mustReset: u.mustReset, active: u.accountStatus === "ACTIVE" };
      }
      case "STUDENT": {
        const u = await this.prisma.student.findFirst({ where });
        return u && { id: u.studentId, passwordHash: u.passwordHash, mustReset: u.mustReset, active: u.accountStatus === "ACTIVE" };
      }
    }
  }

  private async findCredentialById(actor: string, id: string): Promise<Credential | null> {
    switch (actor) {
      case "ADMIN_USER": {
        const u = await this.prisma.adminUser.findFirst({ where: { adminUserId: id, deletedAt: null } });
        return u && { id: u.adminUserId, passwordHash: u.passwordHash, mustReset: u.mustReset, active: true };
      }
      case "COLLEGE_USER": {
        const u = await this.prisma.collegeUser.findFirst({ where: { collegeUserId: id, deletedAt: null } });
        return u && { id: u.collegeUserId, passwordHash: u.passwordHash, mustReset: u.mustReset, active: true };
      }
      case "TRAINER": {
        const u = await this.prisma.trainer.findFirst({ where: { trainerId: id, deletedAt: null } });
        return u && { id: u.trainerId, passwordHash: u.passwordHash, mustReset: u.mustReset, active: true };
      }
      case "STUDENT": {
        const u = await this.prisma.student.findFirst({ where: { studentId: id, deletedAt: null } });
        return u && { id: u.studentId, passwordHash: u.passwordHash, mustReset: u.mustReset, active: true };
      }
      default:
        return null;
    }
  }

  private async updatePasswordHash(actor: string, id: string, passwordHash: string, keepMustReset = true): Promise<void> {
    const data = keepMustReset ? { passwordHash } : { passwordHash, mustReset: false };
    switch (actor) {
      case "ADMIN_USER":
        await this.prisma.adminUser.update({ where: { adminUserId: id }, data });
        return;
      case "COLLEGE_USER":
        await this.prisma.collegeUser.update({ where: { collegeUserId: id }, data });
        return;
      case "TRAINER":
        await this.prisma.trainer.update({ where: { trainerId: id }, data });
        return;
      case "STUDENT":
        await this.prisma.student.update({ where: { studentId: id }, data });
        return;
    }
  }

  private async recordLogin(actor: string, id: string): Promise<void> {
    const lastLoginAt = new Date();
    switch (actor) {
      case "ADMIN_USER":
        await this.prisma.adminUser.update({ where: { adminUserId: id }, data: { lastLoginAt } });
        return;
      case "COLLEGE_USER":
        await this.prisma.collegeUser.update({ where: { collegeUserId: id }, data: { lastLoginAt } });
        return;
      case "STUDENT":
        await this.prisma.student.update({ where: { studentId: id }, data: { lastLoginAt } });
        return;
      default:
        return;
    }
  }
}

/** A real hash of a value nobody knows, for the timing-equalisation path. */
const DUMMY_HASH = hashPassword("::no-such-account::");

/** "15m" | "30d" | "3600s" → milliseconds. */
export function parseDuration(value: string): number {
  const match = /^(\d+)\s*([smhd])?$/.exec(value.trim());
  if (!match) throw new Error(`Not a duration: ${value}`);
  const amount = Number(match[1]);
  const unit = match[2] ?? "s";
  const scale = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit] ?? 1_000;
  return amount * scale;
}
