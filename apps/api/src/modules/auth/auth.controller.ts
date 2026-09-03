import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  changePasswordSchema,
  loginSchema,
  refreshSchema,
  type ChangePasswordInput,
  type LoginInput,
  type Principal,
  type RefreshInput,
} from "@gurukulam/contracts";
import { AuthService } from "./auth.service";
import { zodBody } from "../../common/pipes/zod-validation.pipe";
import { CurrentPrincipal, Public } from "../../common/decorators/principal.decorator";
import { RateLimit } from "../../common/guards/rate-limit.guard";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * Rate limited per caller, on top of the per-account lockout.
   *
   * Lockout stops many guesses against one account; this stops many accounts
   * being tried from one source. An attacker spreading attempts across a
   * thousand addresses never trips lockout at all, which is the gap this
   * closes.
   *
   * 30 a minute is deliberately generous: a fifty-person office behind one
   * NAT arriving at nine o'clock is well inside it, while credential spraying
   * wants orders of magnitude more.
   */
  @Public()
  @RateLimit({ limit: 30, windowSeconds: 60 })
  @Post("login")
  @HttpCode(HttpStatus.OK)
  login(@Body(zodBody(loginSchema)) body: LoginInput, @Req() req: FastifyRequest) {
    return this.auth.login(body, {
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    });
  }

  @Public()
  @RateLimit({ limit: 60, windowSeconds: 60 })
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  refresh(@Body(zodBody(refreshSchema)) body: RefreshInput, @Req() req: FastifyRequest) {
    return this.auth.refresh(body.refreshToken, {
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    });
  }

  @Public()
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body(zodBody(refreshSchema)) body: RefreshInput): Promise<void> {
    await this.auth.logout(body.refreshToken);
  }

  /** Who am I, with my current permissions and scope. */
  @Get("me")
  me(@CurrentPrincipal() principal: Principal) {
    return principal;
  }

  @Post("change-password")
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentPrincipal() principal: Principal,
    @Body(zodBody(changePasswordSchema)) body: ChangePasswordInput,
  ): Promise<void> {
    await this.auth.changePassword(principal, body);
  }
}
