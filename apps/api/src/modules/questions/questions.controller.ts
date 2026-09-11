import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from "@nestjs/common";
import {
  createQuestionSchema, questionQuerySchema, updateQuestionSchema,
  type CreateQuestionInput, type Principal, type QuestionQuery, type UpdateQuestionInput,
} from "@gurukulam/contracts";
import { QuestionsService } from "./questions.service";
import { zodBody } from "../../common/pipes/zod-validation.pipe";
import { CurrentPrincipal, RequirePermission } from "../../common/decorators/principal.decorator";

/** Filed under courses — assessment belongs to a course. */
@Controller("courses/question-bank")
export class QuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  @Get()
  @RequirePermission("courses", "read")
  list(@CurrentPrincipal() p: Principal, @Query(zodBody(questionQuerySchema)) query: QuestionQuery) {
    return this.questions.list(p, query);
  }

  @Get(":id")
  @RequirePermission("courses", "read")
  get(@CurrentPrincipal() p: Principal, @Param("id") id: string) {
    return this.questions.get(p, id);
  }

  @Post()
  @RequirePermission("courses", "edit")
  create(@CurrentPrincipal() p: Principal, @Body(zodBody(createQuestionSchema)) body: CreateQuestionInput) {
    return this.questions.create(p, body);
  }

  @Patch(":id")
  @RequirePermission("courses", "edit")
  update(@CurrentPrincipal() p: Principal, @Param("id") id: string, @Body(zodBody(updateQuestionSchema)) body: UpdateQuestionInput) {
    return this.questions.update(p, id, body);
  }

  @Delete(":id")
  @RequirePermission("courses", "delete")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentPrincipal() p: Principal, @Param("id") id: string): Promise<void> {
    await this.questions.remove(p, id);
  }
}
