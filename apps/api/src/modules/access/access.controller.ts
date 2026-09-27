import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query } from "@nestjs/common";
import {
  adminUserQuerySchema, createAdminUserSchema, createRoleSchema, roleQuerySchema,
  updateAccountSchema, updateAdminUserSchema, updateRoleSchema,
  type AdminUserQuery, type CreateAdminUserInput, type CreateRoleInput, type Principal,
  type RoleQuery, type UpdateAccountInput, type UpdateAdminUserInput, type UpdateRoleInput,
} from "@gurukulam/contracts";
import { AdminUsersService, RolesService } from "./access.service";
import { AccountService } from "./account.service";
import { zodBody } from "../../common/pipes/zod-validation.pipe";
import { CurrentPrincipal, RequirePermission } from "../../common/decorators/principal.decorator";

@Controller("settings")
export class AccessController {
  constructor(
    private readonly roles: RolesService,
    private readonly admins: AdminUsersService,
  ) {}

  @Get("roles")
  @RequirePermission("settings", "read")
  listRoles(@CurrentPrincipal() p: Principal, @Query(zodBody(roleQuerySchema)) q: RoleQuery) {
    return this.roles.list(p, q);
  }

  @Post("roles")
  @RequirePermission("settings", "edit")
  createRole(@CurrentPrincipal() p: Principal, @Body(zodBody(createRoleSchema)) body: CreateRoleInput) {
    return this.roles.create(p, body);
  }

  @Get("roles/:roleId")
  @RequirePermission("settings", "read")
  getRole(@CurrentPrincipal() p: Principal, @Param("roleId") id: string) {
    return this.roles.get(p, id);
  }

  @Patch("roles/:roleId")
  @RequirePermission("settings", "edit")
  updateRole(@CurrentPrincipal() p: Principal, @Param("roleId") id: string, @Body(zodBody(updateRoleSchema)) body: UpdateRoleInput) {
    return this.roles.update(p, id, body);
  }

  @Delete("roles/:roleId")
  @RequirePermission("settings", "delete")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeRole(@CurrentPrincipal() p: Principal, @Param("roleId") id: string): Promise<void> {
    await this.roles.remove(p, id);
  }

  @Get("administrators")
  @RequirePermission("settings", "read")
  listAdmins(@CurrentPrincipal() p: Principal, @Query(zodBody(adminUserQuerySchema)) q: AdminUserQuery) {
    return this.admins.list(p, q);
  }

  /** Returns the temporary password ONCE; only its hash is stored. */
  @Post("administrators")
  @RequirePermission("settings", "edit")
  createAdmin(@CurrentPrincipal() p: Principal, @Body(zodBody(createAdminUserSchema)) body: CreateAdminUserInput) {
    return this.admins.create(p, body);
  }

  @Get("administrators/:adminUserId")
  @RequirePermission("settings", "read")
  getAdmin(@CurrentPrincipal() p: Principal, @Param("adminUserId") id: string) {
    return this.admins.get(p, id);
  }

  @Patch("administrators/:adminUserId")
  @RequirePermission("settings", "edit")
  updateAdmin(@CurrentPrincipal() p: Principal, @Param("adminUserId") id: string, @Body(zodBody(updateAdminUserSchema)) body: UpdateAdminUserInput) {
    return this.admins.update(p, id, body);
  }

  @Post("administrators/:adminUserId/reset-password")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("settings", "edit")
  resetPassword(@CurrentPrincipal() p: Principal, @Param("adminUserId") id: string) {
    return this.admins.resetPassword(p, id);
  }

  @Delete("administrators/:adminUserId")
  @RequirePermission("settings", "delete")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeAdmin(@CurrentPrincipal() p: Principal, @Param("adminUserId") id: string): Promise<void> {
    await this.admins.remove(p, id);
  }
}

/**
 * The account screen. No permission gate: every authenticated actor has one,
 * and it only ever shows their own record.
 */
@Controller("account")
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get()
  get(@CurrentPrincipal() p: Principal) {
    return this.account.get(p);
  }

  /** Photo only — invariant 19. */
  @Put()
  update(@CurrentPrincipal() p: Principal, @Body(zodBody(updateAccountSchema)) body: UpdateAccountInput) {
    return this.account.update(p, body);
  }
}
