import { Controller, Get } from "@nestjs/common";
import type { Principal } from "@gurukulam/contracts";
import { DashboardService } from "./dashboard.service";
import { CurrentPrincipal, RequirePermission } from "../../common/decorators/principal.decorator";

@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /**
   * Deliberately NOT cached.
   *
   * `architecture.md` §7: a cached figure must be scope-derived, or one
   * region's numbers leak into another's. Caching this correctly means a key
   * per scope, and getting that key wrong is invisible — the page renders
   * plausible numbers belonging to someone else. Until there is a measured
   * reason to cache, computing per request is the safe default.
   */
  @Get()
  @RequirePermission("dashboard", "read")
  get(@CurrentPrincipal() principal: Principal) {
    return this.dashboard.build(principal);
  }
}
