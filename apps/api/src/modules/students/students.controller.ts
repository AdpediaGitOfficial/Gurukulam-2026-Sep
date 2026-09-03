import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import {
  allocateStudentSchema, createStudentSchema, studentQuerySchema, suspendStudentSchema, updateStudentSchema,
  type AllocateStudentInput, type CreateStudentInput, type Principal, type StudentQuery,
  type SuspendStudentInput, type UpdateStudentInput,
} from "@gurukulam/contracts";
import { StudentsService } from "./students.service";
import { AllocationService } from "./allocation.service";
import { zodBody } from "../../common/pipes/zod-validation.pipe";
import { CurrentPrincipal, RequirePermission } from "../../common/decorators/principal.decorator";

const deallocateSchema = z.object({
  batchId: z.string().min(1),
  reason: z.string().trim().min(1, "Say why they are leaving the roster").max(400),
});

@Controller("students")
export class StudentsController {
  constructor(
    private readonly students: StudentsService,
    private readonly allocation: AllocationService,
  ) {}

  /** Declared before ":id" so it is never read as a student id. */
  @Get("unallocated")
  @RequirePermission("students", "read")
  unallocated(@CurrentPrincipal() p: Principal) {
    return this.students.unallocatedSummary(p);
  }

  @Get()
  @RequirePermission("students", "read")
  list(@CurrentPrincipal() p: Principal, @Query(zodBody(studentQuerySchema)) q: StudentQuery) {
    return this.students.list(p, q);
  }

  @Post()
  @RequirePermission("students", "edit")
  create(@CurrentPrincipal() p: Principal, @Body(zodBody(createStudentSchema)) body: CreateStudentInput) {
    return this.students.create(p, body);
  }

  @Get(":id")
  @RequirePermission("students", "read")
  get(@CurrentPrincipal() p: Principal, @Param("id") id: string) {
    return this.students.get(p, id);
  }

  @Patch(":id")
  @RequirePermission("students", "edit")
  update(@CurrentPrincipal() p: Principal, @Param("id") id: string, @Body(zodBody(updateStudentSchema)) body: UpdateStudentInput) {
    return this.students.update(p, id, body);
  }

  /**
   * The five-step allocation, applied as one transaction (invariant 12).
   * Retail creates a ledger; college does not (invariant 3).
   */
  @Post(":id/allocate")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("students", "edit")
  allocate(@CurrentPrincipal() p: Principal, @Param("id") id: string, @Body(zodBody(allocateStudentSchema)) body: AllocateStudentInput) {
    return this.allocation.allocate(p, id, body);
  }

  @Post(":id/deallocate")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("students", "edit")
  async deallocate(@CurrentPrincipal() p: Principal, @Param("id") id: string, @Body(zodBody(deallocateSchema)) body: { batchId: string; reason: string }): Promise<void> {
    await this.allocation.deallocate(p, id, body.batchId, body.reason);
  }

  @Post(":id/suspend")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("students", "edit")
  suspend(@CurrentPrincipal() p: Principal, @Param("id") id: string, @Body(zodBody(suspendStudentSchema)) body: SuspendStudentInput) {
    return this.students.suspend(p, id, body);
  }

  @Post(":id/reinstate")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("students", "edit")
  reinstate(@CurrentPrincipal() p: Principal, @Param("id") id: string) {
    return this.students.reinstate(p, id);
  }

  @Delete(":id")
  @RequirePermission("students", "delete")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentPrincipal() p: Principal, @Param("id") id: string): Promise<void> {
    await this.students.remove(p, id);
  }
}
