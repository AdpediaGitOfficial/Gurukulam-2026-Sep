import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { Inject } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { can, type Action, type ModuleName, type Principal } from "@gurukulam/contracts";
import { ENV, type Env } from "../../config/env";
import { ApiException } from "../errors";
import { PrincipalService } from "../../modules/auth/principal.service";
import { IS_PUBLIC, REQUIRED_PERMISSION } from "../decorators/principal.decorator";

export interface AccessTokenPayload {
  sub: string;
  actor: Principal["actor"];
  /** Present so a token issued before a forced sign-out can be recognised. */
  iat?: number;
  exp?: number;
}

/**
 * Authenticates every request and applies the coarse permission gate.
 *
 * Registered globally, so a new route is protected by default and has to opt
 * out with @Public(). The opposite default — protect-on-request — means the
 * one route someone forgets is the one that leaks.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly principals: PrincipalService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest & { principal?: Principal }>();
    const token = this.bearerFrom(request);
    if (!token) throw ApiException.unauthenticated();

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.env.JWT_ACCESS_SECRET,
      });
    } catch (e) {
      throw e instanceof Error && e.name === "TokenExpiredError"
        ? ApiException.tokenExpired()
        : ApiException.unauthenticated();
    }

    // Built fresh from the database on every request: a revoked permission or
    // a narrowed city scope takes effect now, not when the token expires.
    const principal = await this.principals.forActor(payload.actor, payload.sub);
    request.principal = principal;

    const required = this.reflector.getAllAndOverride<{ module: ModuleName; action: Action }>(
      REQUIRED_PERMISSION,
      [context.getHandler(), context.getClass()],
    );
    if (required && !can(principal, required.module, required.action)) {
      throw ApiException.forbidden(
        `You do not have ${required.action} permission on ${required.module}`,
      );
    }

    return true;
  }

  private bearerFrom(request: FastifyRequest): string | null {
    const header = request.headers.authorization;
    if (!header) return null;
    const [scheme, value] = header.split(" ");
    if (!value || scheme?.toLowerCase() !== "bearer") return null;
    return value;
  }
}
