import { Controller, Get } from "@nestjs/common";
import type { Principal } from "@gurukulam/contracts";
import { TrainerMeService } from "./trainer-me.service";
import { CurrentPrincipal, RequireActor } from "../../common/decorators/principal.decorator";

/**
 * The trainer's own record, and what is waiting for them.
 *
 * `@RequireActor("TRAINER")` rather than a permission, for the same reason the
 * student's surface uses one: these routes are about WHO is asking, not about
 * a module. An admin holding `trainers:read` has no business reading "my
 * dashboard" — there is no `my` for them, and the answer would be an empty
 * one dressed as a real one.
 *
 * Every cohort read a trainer makes goes through the ordinary modules with
 * `trainerScope` applied inside them. This carries no `:id` anywhere, because
 * the record is the principal's.
 */
@Controller("me/trainer")
@RequireActor("TRAINER")
export class TrainerMeController {
  constructor(private readonly trainer: TrainerMeService) {}

  @Get()
  profile(@CurrentPrincipal() p: Principal) {
    return this.trainer.profile(p);
  }

  /** Delivery, as figures a trainer can act on. */
  @Get("dashboard")
  dashboard(@CurrentPrincipal() p: Principal) {
    return this.trainer.dashboard(p);
  }

  /** Always empty for an in-house trainer — they are staff, not a counterparty. */
  @Get("invitations")
  invitations(@CurrentPrincipal() p: Principal) {
    return this.trainer.invitations(p);
  }
}
