import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query } from "@nestjs/common";
import {
  courseQuerySchema, createCourseSchema, replaceTopicsSchema, updateCourseSchema,
  type CourseQuery, type CreateCourseInput, type Principal, type ReplaceTopicsInput, type UpdateCourseInput,
} from "@gurukulam/contracts";
import { CoursesService } from "./courses.service";
import { zodBody } from "../../common/pipes/zod-validation.pipe";
import { CurrentPrincipal, RequirePermission } from "../../common/decorators/principal.decorator";

/** HTTP only — parse, delegate, serialise. No business logic lives here. */
@Controller("courses")
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get()
  @RequirePermission("courses", "read")
  list(@CurrentPrincipal() principal: Principal, @Query(zodBody(courseQuerySchema)) query: CourseQuery) {
    return this.courses.list(principal, query);
  }

  @Get(":id")
  @RequirePermission("courses", "read")
  get(@CurrentPrincipal() principal: Principal, @Param("id") id: string) {
    return this.courses.get(principal, id);
  }

  @Post()
  @RequirePermission("courses", "edit")
  create(@CurrentPrincipal() principal: Principal, @Body(zodBody(createCourseSchema)) body: CreateCourseInput) {
    return this.courses.create(principal, body);
  }

  @Patch(":id")
  @RequirePermission("courses", "edit")
  update(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body(zodBody(updateCourseSchema)) body: UpdateCourseInput,
  ) {
    return this.courses.update(principal, id, body);
  }

  @Put(":id/topics")
  @RequirePermission("courses", "edit")
  replaceTopics(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body(zodBody(replaceTopicsSchema)) body: ReplaceTopicsInput,
  ) {
    return this.courses.replaceTopics(principal, id, body);
  }

  @Delete(":id")
  @RequirePermission("courses", "delete")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<void> {
    await this.courses.remove(principal, id);
  }
}
