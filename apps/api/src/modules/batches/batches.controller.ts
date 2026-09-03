import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import {
  batchQuerySchema, createAssignmentSchema, createBatchSchema, createSessionSchema,
  linkRecordingSchema, proposeTrainerSchema, rescheduleSessionSchema, respondToProposalSchema,
  sessionQuerySchema, updateAssignmentSchema, updateBatchSchema, updateSessionSchema,
  type BatchQuery, type CreateAssignmentInput, type CreateBatchInput, type CreateSessionInput,
  type LinkRecordingInput, type Principal, type ProposeTrainerInput, type RescheduleSessionInput,
  type RespondToProposalInput, type SessionQuery, type UpdateAssignmentInput, type UpdateBatchInput,
  type UpdateSessionInput,
} from "@gurukulam/contracts";
import { BatchesService } from "./batches.service";
import { SessionsService } from "./sessions.service";
import { zodBody } from "../../common/pipes/zod-validation.pipe";
import { CurrentPrincipal, RequirePermission } from "../../common/decorators/principal.decorator";

const cancelSchema = z.object({ reason: z.string().trim().min(1, "Say why it was cancelled").max(500) });

@Controller("batches")
export class BatchesController {
  constructor(
    private readonly batches: BatchesService,
    private readonly sessions: SessionsService,
  ) {}

  // ── Sessions first: static segments must be declared before ":id" so a
  //    session route is never read as a batch id.
  @Get("sessions")
  @RequirePermission("batches", "read")
  listSessions(@CurrentPrincipal() p: Principal, @Query(zodBody(sessionQuerySchema)) q: SessionQuery) {
    return this.sessions.list(p, q);
  }

  @Post("sessions")
  @RequirePermission("batches", "edit")
  createSession(@CurrentPrincipal() p: Principal, @Body(zodBody(createSessionSchema)) body: CreateSessionInput) {
    return this.sessions.create(p, body);
  }

  @Get("sessions/:sessionId")
  @RequirePermission("batches", "read")
  getSession(@CurrentPrincipal() p: Principal, @Param("sessionId") id: string) {
    return this.sessions.get(p, id);
  }

  @Patch("sessions/:sessionId")
  @RequirePermission("batches", "edit")
  updateSession(@CurrentPrincipal() p: Principal, @Param("sessionId") id: string, @Body(zodBody(updateSessionSchema)) body: UpdateSessionInput) {
    return this.sessions.update(p, id, body);
  }

  /** Moves a session in place, so attendance and the recording stay attached. */
  @Post("sessions/:sessionId/reschedule")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("batches", "edit")
  reschedule(@CurrentPrincipal() p: Principal, @Param("sessionId") id: string, @Body(zodBody(rescheduleSessionSchema)) body: RescheduleSessionInput) {
    return this.sessions.reschedule(p, id, body);
  }

  /** The deliberate act that releases assignments (invariant 17). */
  @Post("sessions/:sessionId/complete")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("batches", "edit")
  markComplete(@CurrentPrincipal() p: Principal, @Param("sessionId") id: string) {
    return this.sessions.markComplete(p, id);
  }

  @Post("sessions/:sessionId/reopen")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("batches", "edit")
  reopen(@CurrentPrincipal() p: Principal, @Param("sessionId") id: string) {
    return this.sessions.reopen(p, id);
  }

  @Post("sessions/:sessionId/cancel")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("batches", "edit")
  cancelSession(@CurrentPrincipal() p: Principal, @Param("sessionId") id: string, @Body(zodBody(cancelSchema)) body: { reason: string }) {
    return this.sessions.cancel(p, id, body.reason);
  }

  @Delete("sessions/:sessionId")
  @RequirePermission("batches", "delete")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeSession(@CurrentPrincipal() p: Principal, @Param("sessionId") id: string): Promise<void> {
    await this.sessions.remove(p, id);
  }

  @Post("sessions/:sessionId/assignments")
  @RequirePermission("batches", "edit")
  createAssignment(@CurrentPrincipal() p: Principal, @Param("sessionId") id: string, @Body(zodBody(createAssignmentSchema)) body: CreateAssignmentInput) {
    return this.sessions.createAssignment(p, id, body);
  }

  @Patch("assignments/:assignmentId")
  @RequirePermission("batches", "edit")
  updateAssignment(@CurrentPrincipal() p: Principal, @Param("assignmentId") id: string, @Body(zodBody(updateAssignmentSchema)) body: UpdateAssignmentInput) {
    return this.sessions.updateAssignment(p, id, body);
  }

  @Delete("assignments/:assignmentId")
  @RequirePermission("batches", "delete")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeAssignment(@CurrentPrincipal() p: Principal, @Param("assignmentId") id: string): Promise<void> {
    await this.sessions.removeAssignment(p, id);
  }

  @Post("sessions/:sessionId/recording")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("batches", "edit")
  linkRecording(@CurrentPrincipal() p: Principal, @Param("sessionId") id: string, @Body(zodBody(linkRecordingSchema)) body: LinkRecordingInput) {
    return this.sessions.linkRecording(p, id, body);
  }

  @Post("sessions/:sessionId/recording/unpublish")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("batches", "edit")
  unpublishRecording(@CurrentPrincipal() p: Principal, @Param("sessionId") id: string) {
    return this.sessions.unpublishRecording(p, id);
  }

  // ── Batches ─────────────────────────────────────────────────────────────

  @Get()
  @RequirePermission("batches", "read")
  list(@CurrentPrincipal() p: Principal, @Query(zodBody(batchQuerySchema)) q: BatchQuery) {
    return this.batches.list(p, q);
  }

  @Post()
  @RequirePermission("batches", "edit")
  create(@CurrentPrincipal() p: Principal, @Body(zodBody(createBatchSchema)) body: CreateBatchInput) {
    return this.batches.create(p, body);
  }

  @Get(":id")
  @RequirePermission("batches", "read")
  get(@CurrentPrincipal() p: Principal, @Param("id") id: string) {
    return this.batches.get(p, id);
  }

  @Patch(":id")
  @RequirePermission("batches", "edit")
  update(@CurrentPrincipal() p: Principal, @Param("id") id: string, @Body(zodBody(updateBatchSchema)) body: UpdateBatchInput) {
    return this.batches.update(p, id, body);
  }

  /** Step one of the handshake — a proposal is not committed delivery. */
  @Post(":id/trainer/propose")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("batches", "edit")
  proposeTrainer(@CurrentPrincipal() p: Principal, @Param("id") id: string, @Body(zodBody(proposeTrainerSchema)) body: ProposeTrainerInput) {
    return this.batches.proposeTrainer(p, id, body);
  }

  /** Step two. Recorded by an admin on the trainer's behalf until that portal exists. */
  @Post(":id/trainer/respond")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("batches", "edit")
  respond(@CurrentPrincipal() p: Principal, @Param("id") id: string, @Body(zodBody(respondToProposalSchema)) body: RespondToProposalInput) {
    return this.batches.respondToProposal(p, id, body);
  }

  @Delete(":id/trainer/propose")
  @RequirePermission("batches", "edit")
  @HttpCode(HttpStatus.NO_CONTENT)
  async withdraw(@CurrentPrincipal() p: Principal, @Param("id") id: string): Promise<void> {
    await this.batches.withdrawProposal(p, id);
  }

  @Delete(":id")
  @RequirePermission("batches", "delete")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentPrincipal() p: Principal, @Param("id") id: string): Promise<void> {
    await this.batches.remove(p, id);
  }
}
