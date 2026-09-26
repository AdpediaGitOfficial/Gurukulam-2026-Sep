import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from "@nestjs/common";
import {
  markNoticesReadSchema,
  submitAssignmentSchema,
  updateMeSchema,
  type MarkNoticesReadInput,
  type Principal,
  type SubmitAssignmentInput,
  type UpdateMeInput,
} from "@gurukulam/contracts";
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

  /**
   * What is owed, and what has been paid.
   *
   * Answers for a college student too, and says `billedToCollege` rather than
   * refusing — a refusal would render as an error on a screen whose honest
   * answer is "your institution is billed for this".
   */
  @Get("fees")
  fees(@CurrentPrincipal() p: Principal) {
    return this.me.fees(p);
  }

  /** Already split into upcoming and past — see the service for why. */
  @Get("schedule")
  schedule(@CurrentPrincipal() p: Principal) {
    return this.me.schedule(p);
  }

  /**
   * What has changed, for this student and nobody else.
   *
   * Deliberately not the console's `/notifications`, whose audience rule
   * includes every row addressed to nobody in particular — see the service.
   */
  @Get("notifications")
  notifications(@CurrentPrincipal() p: Principal) {
    return this.me.notifications(p);
  }

  /** FYI and ALERT only. Action-required rows clear when their condition does. */
  @Post("notifications/read")
  @HttpCode(HttpStatus.OK)
  markNoticesRead(
    @CurrentPrincipal() p: Principal,
    @Body(zodBody(markNoticesReadSchema)) body: MarkNoticesReadInput,
  ) {
    return this.me.markNoticesRead(p, body);
  }

  /**
   * The postings whose audience this student matches.
   *
   * Evaluated at read time from the operator's own rules — there is no stored
   * grant, so a student who enrolled this morning is reached this morning.
   */
  @Get("jobs")
  jobs(@CurrentPrincipal() p: Principal) {
    return this.me.jobs(p);
  }

  /**
   * What they have earned, and the batches still to produce one.
   *
   * Answers for a college student too — the record is theirs to see even though
   * the download is not. Refusing would render as an error on a screen whose
   * honest answer is "your institution holds it" (invariant 7).
   */
  @Get("certificates")
  certificates(@CurrentPrincipal() p: Principal) {
    return this.me.certificates(p);
  }

  /** Split three ways: still to do, handed in, and the window closed. */
  @Get("assignments")
  assignments(@CurrentPrincipal() p: Principal) {
    return this.me.assignments(p);
  }

  /**
   * The one write on this surface that touches somebody else's record.
   *
   * It takes an `:id`, which every read here deliberately avoids — an
   * assignment belongs to a batch, not to a student, so there is nothing else
   * to name it by. The id is not trusted: the service matches it against the
   * caller's own batch mappings in the same query, so an assignment they are
   * not on reads as not found rather than as a refusal.
   */
  @Post("assignments/:assignmentId/submit")
  submitAssignment(
    @CurrentPrincipal() p: Principal,
    @Param("assignmentId") assignmentId: string,
    @Body(zodBody(submitAssignmentSchema)) body: SubmitAssignmentInput,
  ) {
    return this.me.submitAssignment(p, assignmentId, body);
  }
}
