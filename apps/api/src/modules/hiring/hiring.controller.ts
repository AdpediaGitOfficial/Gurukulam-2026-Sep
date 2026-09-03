import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import {
  createJobSchema, jobQuerySchema, updateJobSchema,
  type CreateJobInput, type JobQuery, type Principal, type UpdateJobInput,
} from "@gurukulam/contracts";
import { HiringService } from "./hiring.service";
import { zodBody } from "../../common/pipes/zod-validation.pipe";
import { CurrentPrincipal, RequirePermission } from "../../common/decorators/principal.decorator";

const statusSchema = z.object({ status: z.enum(["CLOSED", "ARCHIVED"]) });
/** The compose screen previews reach before a posting exists, so this takes
 *  the audience rules alone rather than a whole draft posting. */
const previewSchema = z.object({
  audienceRules: z
    .array(
      z.object({
        courseId: z.string().min(1, "Every audience rule starts from a course"),
        batchId: z.string().optional(),
        collegeId: z.string().optional(),
        cityId: z.string().optional(),
        passoutYear: z.number().int().min(1950).max(2100).optional(),
        segment: z.enum(["RETAIL", "COLLEGE"]).optional(),
        completedOnly: z.boolean().default(false),
      }),
    )
    .max(50),
});

@Controller("hiring")
export class HiringController {
  constructor(private readonly hiring: HiringService) {}

  @Get()
  @RequirePermission("hiring", "read")
  list(@CurrentPrincipal() p: Principal, @Query(zodBody(jobQuerySchema)) query: JobQuery) {
    return this.hiring.list(p, query);
  }

  /**
   * Reach for rules that have not been saved. The compose screen calls this
   * before publishing, so an operator sees who a posting will actually reach.
   */
  @Post("reach-preview")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("hiring", "read")
  async previewReach(@Body(zodBody(previewSchema)) body: { audienceRules: CreateJobInput["audienceRules"] }) {
    return { reach: await this.hiring.previewReach(body.audienceRules) };
  }

  @Get(":id")
  @RequirePermission("hiring", "read")
  get(@CurrentPrincipal() p: Principal, @Param("id") id: string) {
    return this.hiring.get(p, id);
  }

  @Post()
  @RequirePermission("hiring", "edit")
  create(@CurrentPrincipal() p: Principal, @Body(zodBody(createJobSchema)) body: CreateJobInput) {
    return this.hiring.create(p, body);
  }

  @Patch(":id")
  @RequirePermission("hiring", "edit")
  update(@CurrentPrincipal() p: Principal, @Param("id") id: string, @Body(zodBody(updateJobSchema)) body: UpdateJobInput) {
    return this.hiring.update(p, id, body);
  }

  @Post(":id/publish")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("hiring", "edit")
  publish(@CurrentPrincipal() p: Principal, @Param("id") id: string) {
    return this.hiring.publish(p, id);
  }

  @Patch(":id/status")
  @RequirePermission("hiring", "edit")
  setStatus(@CurrentPrincipal() p: Principal, @Param("id") id: string, @Body(zodBody(statusSchema)) body: { status: "CLOSED" | "ARCHIVED" }) {
    return this.hiring.setStatus(p, id, body.status);
  }

  @Delete(":id")
  @RequirePermission("hiring", "delete")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentPrincipal() p: Principal, @Param("id") id: string): Promise<void> {
    await this.hiring.remove(p, id);
  }
}
