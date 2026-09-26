import { Controller, Get } from "@nestjs/common";
import type { Principal } from "@gurukulam/contracts";
import { CollegeMeService } from "./college-me.service";
import { CurrentPrincipal, RequireActor } from "../../common/decorators/principal.decorator";

/**
 * The institution's own record, how the engagement is going, and what it owes.
 *
 * `@RequireActor("COLLEGE_USER")` rather than a permission, for the reason the
 * student's and the trainer's surfaces use one: these routes are about WHO is
 * asking. An admin holding `colleges:read` has no "my college", and answering
 * them with an empty shape dressed as a real one is worse than refusing.
 *
 * No route here takes an id. Every cohort, roster, requirement and certificate
 * read a college makes goes through the ordinary modules with `collegeScope`
 * applied inside them — this is only what could not be narrowed from an admin
 * response.
 */
@Controller("me/college")
@RequireActor("COLLEGE_USER")
export class CollegeMeController {
  constructor(private readonly college: CollegeMeService) {}

  @Get()
  profile(@CurrentPrincipal() p: Principal) {
    return this.college.profile(p);
  }

  /** Their engagement, computed only from rows carrying their college. */
  @Get("dashboard")
  dashboard(@CurrentPrincipal() p: Principal) {
    return this.college.dashboard(p);
  }

  /**
   * The catalogue, without the price we quote from.
   *
   * A college must be able to name the course it is asking for. `courses` is
   * absent from its permission matrix, so this narrow shape is the only way in —
   * and it has no field for `standardMarketValueMinor` rather than projecting it
   * away.
   */
  @Get("courses")
  courses(@CurrentPrincipal() p: Principal) {
    return this.college.courses(p);
  }

  /** The contract side of invariant 3 — in this segment the college pays. */
  @Get("billing")
  billing(@CurrentPrincipal() p: Principal) {
    return this.college.billing(p);
  }
}
