import { Body, Controller, Get, Patch } from "@nestjs/common";
import { updateMeSchema, type Principal, type UpdateMeInput } from "@gurukulam/contracts";
import { MeService } from "./me.service";
import { zodBody } from "../../common/pipes/zod-validation.pipe";
import { CurrentPrincipal, RequireActor } from "../../common/decorators/principal.decorator";

/**
 * Everything a student may ask about themselves.
 *
 * ── Why there is no `:id` anywhere below ────────────────────────────────
 *
 * The record is the principal's. A route that took an id would need a check
 * that the id is the caller's, and a check can be forgotten on the next
 * handler somebody adds. With no parameter there is nothing to tamper with
 * and nothing to remember — the scope is structural.
 *
 * `@RequireActor("STUDENT")` on the class rather than a permission, because a
 * student holds none by design. See the decorator for why that is the right
 * default and why a bare authenticated route would be worse.
 */
@Controller("me")
@RequireActor("STUDENT")
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  profile(@CurrentPrincipal() p: Principal) {
    return this.me.profile(p);
  }

  /** The narrow set. What is absent, and why, is listed on `updateMeSchema`. */
  @Patch()
  updateProfile(@CurrentPrincipal() p: Principal, @Body(zodBody(updateMeSchema)) body: UpdateMeInput) {
    return this.me.updateProfile(p, body);
  }

  @Get("home")
  home(@CurrentPrincipal() p: Principal) {
    return this.me.home(p);
  }

  @Get("batches")
  batches(@CurrentPrincipal() p: Principal) {
    return this.me.batches(p);
  }

  /** Already split into upcoming and past — see the service for why. */
  @Get("schedule")
  schedule(@CurrentPrincipal() p: Principal) {
    return this.me.schedule(p);
  }
}
