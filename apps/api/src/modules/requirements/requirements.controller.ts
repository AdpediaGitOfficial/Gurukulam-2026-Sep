import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from "@nestjs/common";
import {
  confirmRequirementSchema, createRequirementSchema, grantPortalAccessSchema,
  rejectRequirementSchema, requirementQuerySchema, revokePortalAccessSchema, updateRequirementSchema,
  type ConfirmRequirementInput, type CreateRequirementInput, type GrantPortalAccessInput,
  type Principal, type RejectRequirementInput, type RequirementQuery,
  type RevokePortalAccessInput, type UpdateRequirementInput,
} from "@gurukulam/contracts";
import { PortalAccessService, RequirementsService } from "./requirements.service";
import { zodBody } from "../../common/pipes/zod-validation.pipe";
import { CurrentPrincipal, RequirePermission } from "../../common/decorators/principal.decorator";

@Controller("colleges")
export class RequirementsController {
  constructor(
    private readonly requirements: RequirementsService,
    private readonly access: PortalAccessService,
  ) {}

  // Declared before the colleges controller's ":id" routes would be reached;
  // Fastify prefers static segments regardless, but the ordering is explicit.
  @Get("requirements")
  @RequirePermission("requirements", "read")
  list(@CurrentPrincipal() p: Principal, @Query(zodBody(requirementQuerySchema)) q: RequirementQuery) {
    return this.requirements.list(p, q);
  }

  /** A college raises its own; an admin may log one on their behalf. */
  @Post("requirements")
  @RequirePermission("requirements", "edit")
  create(@CurrentPrincipal() p: Principal, @Body(zodBody(createRequirementSchema)) body: CreateRequirementInput) {
    return this.requirements.create(p, body);
  }

  @Get("requirements/:requirementId")
  @RequirePermission("requirements", "read")
  get(@CurrentPrincipal() p: Principal, @Param("requirementId") id: string) {
    return this.requirements.get(p, id);
  }

  @Patch("requirements/:requirementId")
  @RequirePermission("requirements", "edit")
  update(@CurrentPrincipal() p: Principal, @Param("requirementId") id: string, @Body(zodBody(updateRequirementSchema)) body: UpdateRequirementInput) {
    return this.requirements.update(p, id, body);
  }

  /** Confirmation CREATES the dedicated batch and links it (invariant 14). */
  @Post("requirements/:requirementId/confirm")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("requirements", "edit")
  confirm(@CurrentPrincipal() p: Principal, @Param("requirementId") id: string, @Body(zodBody(confirmRequirementSchema)) body: ConfirmRequirementInput) {
    return this.requirements.confirm(p, id, body);
  }

  @Post("requirements/:requirementId/reject")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("requirements", "edit")
  reject(@CurrentPrincipal() p: Principal, @Param("requirementId") id: string, @Body(zodBody(rejectRequirementSchema)) body: RejectRequirementInput) {
    return this.requirements.reject(p, id, body);
  }

  @Post("requirements/:requirementId/fulfil")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("requirements", "edit")
  fulfil(@CurrentPrincipal() p: Principal, @Param("requirementId") id: string) {
    return this.requirements.markFulfilled(p, id);
  }

  // ── Portal access ───────────────────────────────────────────────────────

  @Get(":collegeId/access")
  @RequirePermission("colleges", "read")
  listAccess(@CurrentPrincipal() p: Principal, @Param("collegeId") id: string) {
    return this.access.list(p, id);
  }

  /**
   * Granting emails the contact their credentials. The temporary password is
   * returned ONCE — only its hash is kept.
   */
  @Post(":collegeId/access")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("colleges", "edit")
  grant(@CurrentPrincipal() p: Principal, @Param("collegeId") id: string, @Body(zodBody(grantPortalAccessSchema)) body: GrantPortalAccessInput) {
    return this.access.grant(p, id, body);
  }

  @Post("access/:collegeUserId/revoke")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("colleges", "edit")
  revoke(@CurrentPrincipal() p: Principal, @Param("collegeUserId") id: string, @Body(zodBody(revokePortalAccessSchema)) body: RevokePortalAccessInput) {
    return this.access.revoke(p, id, body);
  }
}
