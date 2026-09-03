import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query } from "@nestjs/common";
import {
  approveCoursesSchema, createTrainerSchema, trainerQuerySchema, updateTrainerSchema,
  type ApproveCoursesInput, type CreateTrainerInput, type Principal, type TrainerQuery, type UpdateTrainerInput,
} from "@gurukulam/contracts";
import { TrainersService } from "./trainers.service";
import { zodBody } from "../../common/pipes/zod-validation.pipe";
import { CurrentPrincipal, RequirePermission } from "../../common/decorators/principal.decorator";

@Controller("trainers")
export class TrainersController {
  constructor(private readonly trainers: TrainersService) {}

  @Get()
  @RequirePermission("trainers", "read")
  list(@CurrentPrincipal() p: Principal, @Query(zodBody(trainerQuerySchema)) query: TrainerQuery) {
    return this.trainers.list(p, query);
  }

  @Get(":id")
  @RequirePermission("trainers", "read")
  get(@CurrentPrincipal() p: Principal, @Param("id") id: string) {
    return this.trainers.get(p, id);
  }

  @Post()
  @RequirePermission("trainers", "edit")
  create(@CurrentPrincipal() p: Principal, @Body(zodBody(createTrainerSchema)) body: CreateTrainerInput) {
    return this.trainers.create(p, body);
  }

  @Patch(":id")
  @RequirePermission("trainers", "edit")
  update(@CurrentPrincipal() p: Principal, @Param("id") id: string, @Body(zodBody(updateTrainerSchema)) body: UpdateTrainerInput) {
    return this.trainers.update(p, id, body);
  }

  /** Which courses this trainer may run (invariant 15). */
  @Put(":id/courses")
  @RequirePermission("trainers", "edit")
  approveCourses(@CurrentPrincipal() p: Principal, @Param("id") id: string, @Body(zodBody(approveCoursesSchema)) body: ApproveCoursesInput) {
    return this.trainers.approveCourses(p, id, body);
  }

  @Delete(":id")
  @RequirePermission("trainers", "delete")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentPrincipal() p: Principal, @Param("id") id: string): Promise<void> {
    await this.trainers.remove(p, id);
  }
}
