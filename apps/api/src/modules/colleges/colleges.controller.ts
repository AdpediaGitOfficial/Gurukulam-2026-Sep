import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query } from "@nestjs/common";
import {
  collegeQuerySchema, createCollegeSchema, replacePocsSchema, updateCollegeSchema,
  type CollegeQuery, type CreateCollegeInput, type Principal, type ReplacePocsInput, type UpdateCollegeInput,
} from "@gurukulam/contracts";
import { CollegesService } from "./colleges.service";
import { zodBody } from "../../common/pipes/zod-validation.pipe";
import { CurrentPrincipal, RequirePermission } from "../../common/decorators/principal.decorator";

@Controller("colleges")
export class CollegesController {
  constructor(private readonly colleges: CollegesService) {}

  @Get()
  @RequirePermission("colleges", "read")
  list(@CurrentPrincipal() p: Principal, @Query(zodBody(collegeQuerySchema)) query: CollegeQuery) {
    return this.colleges.list(p, query);
  }

  @Get(":id")
  @RequirePermission("colleges", "read")
  get(@CurrentPrincipal() p: Principal, @Param("id") id: string) {
    return this.colleges.get(p, id);
  }

  @Post()
  @RequirePermission("colleges", "edit")
  create(@CurrentPrincipal() p: Principal, @Body(zodBody(createCollegeSchema)) body: CreateCollegeInput) {
    return this.colleges.create(p, body);
  }

  @Patch(":id")
  @RequirePermission("colleges", "edit")
  update(@CurrentPrincipal() p: Principal, @Param("id") id: string, @Body(zodBody(updateCollegeSchema)) body: UpdateCollegeInput) {
    return this.colleges.update(p, id, body);
  }

  @Put(":id/contacts")
  @RequirePermission("colleges", "edit")
  replacePocs(@CurrentPrincipal() p: Principal, @Param("id") id: string, @Body(zodBody(replacePocsSchema)) body: ReplacePocsInput) {
    return this.colleges.replacePocs(p, id, body);
  }

  @Delete(":id")
  @RequirePermission("colleges", "delete")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentPrincipal() p: Principal, @Param("id") id: string): Promise<void> {
    await this.colleges.remove(p, id);
  }
}
