import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query } from "@nestjs/common";
import {
  approveCoursesSchema, calendarQuerySchema, createTrainerSchema, declareAvailabilitySchema,
  suspendTrainerSchema, type SuspendTrainerInput,
  trainerQuerySchema, updateTrainerSchema,
  type ApproveCoursesInput, type CalendarQuery, type CreateTrainerInput,
  type DeclareAvailabilityInput, type Principal, type TrainerQuery, type UpdateTrainerInput,
} from "@gurukulam/contracts";
import { TrainersService } from "./trainers.service";
import { AvailabilityService } from "./availability.service";
import { zodBody } from "../../common/pipes/zod-validation.pipe";
import { CurrentPrincipal, RequirePermission } from "../../common/decorators/principal.decorator";

@Controller("trainers")
export class TrainersController {
  constructor(
    private readonly trainers: TrainersService,
    private readonly availability: AvailabilityService,
  ) {}

  /**
   * The availability calendar — the ASSIGNMENT SURFACE, not a report. Declared
   * before ":id" so it is never read as a trainer id.
   *
   * Free/busy is computed from committed sessions plus declared leave
   * (invariant 8). Pass `courseId` and each entry also says whether the
   * trainer is approved for it (invariant 15), which is the question the batch
   * picker is really asking.
   */
  @Get("calendar")
  @RequirePermission("trainers", "read")
  calendar(@CurrentPrincipal() p: Principal, @Query(zodBody(calendarQuerySchema)) q: CalendarQuery) {
    return this.availability.calendar(p, q);
  }

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

  /** Suspension carries a reason, so an account that stopped working explains itself. */
  @Post(":id/suspend")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("trainers", "edit")
  suspend(@CurrentPrincipal() p: Principal, @Param("id") id: string, @Body(zodBody(suspendTrainerSchema)) body: SuspendTrainerInput) {
    return this.trainers.suspend(p, id, body);
  }

  @Post(":id/reinstate")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("trainers", "edit")
  reinstate(@CurrentPrincipal() p: Principal, @Param("id") id: string) {
    return this.trainers.reinstate(p, id);
  }

  @Get(":id/availability")
  @RequirePermission("trainers", "read")
  listAvailability(@CurrentPrincipal() p: Principal, @Param("id") id: string) {
    return this.availability.list(p, id);
  }

  /** Refused when it would cover a session the trainer is committed to. */
  @Post(":id/availability")
  @RequirePermission("trainers", "edit")
  declare(@CurrentPrincipal() p: Principal, @Param("id") id: string, @Body(zodBody(declareAvailabilitySchema)) body: DeclareAvailabilityInput) {
    return this.availability.declare(p, id, body);
  }

  @Delete("availability/:availabilityId")
  @RequirePermission("trainers", "edit")
  @HttpCode(HttpStatus.NO_CONTENT)
  async withdraw(@CurrentPrincipal() p: Principal, @Param("availabilityId") id: string): Promise<void> {
    await this.availability.withdraw(p, id);
  }

  @Delete(":id")
  @RequirePermission("trainers", "delete")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentPrincipal() p: Principal, @Param("id") id: string): Promise<void> {
    await this.trainers.remove(p, id);
  }
}
