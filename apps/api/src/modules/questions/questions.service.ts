import { Injectable } from "@nestjs/common";
import { Prisma } from "@gurukulam/db";
import type {
  CreateQuestionInput, Page, Principal, Question, QuestionQuery, UpdateQuestionInput,
} from "@gurukulam/contracts";
import { PrismaService } from "../prisma/prisma.module";
import { ApiException } from "../../common/errors";
import { liveOnly } from "../../common/scope/scope";
import { listPage, orderBy, paginate } from "../../common/scope/pagination";

const SORTABLE = ["createdAt", "difficulty", "marks"] as const;

/**
 * The question bank sits under Courses, because assessment belongs to a
 * course. Like the catalogue it carries no city or college, so it is not
 * scoped — the same bank serves every region.
 *
 * The shape rules (options present, answer keys naming real options) live in
 * the contract's superRefine, so they apply identically on create and update
 * and a valid question cannot be edited into an invalid one.
 */
@Injectable()
export class QuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(_principal: Principal, query: QuestionQuery): Promise<Page<Question>> {
    const where: Prisma.QuestionBankWhereInput = {
      ...liveOnly(query.includeDeleted),
      ...(query.courseId ? { courseId: query.courseId } : {}),
      ...(query.topicId ? { topicId: query.topicId } : {}),
      ...(query.questionType ? { questionType: query.questionType } : {}),
      ...(query.difficulty ? { difficulty: query.difficulty } : {}),
      ...(query.q
        ? {
            OR: [
              { questionText: { contains: query.q, mode: "insensitive" } },
              { tags: { has: query.q } },
            ],
          }
        : {}),
    };

    return listPage(query, async () => {
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.questionBank.findMany({
          where,
          orderBy: orderBy(query, SORTABLE, "createdAt"),
          ...paginate(query),
          include: {
            course: { select: { name: true } },
            topic: { select: { title: true } },
          },
        }),
        this.prisma.questionBank.count({ where }),
      ]);
      return [rows.map(toQuestion), total];
    });
  }

  async get(_principal: Principal, questionId: string): Promise<Question> {
    const row = await this.prisma.questionBank.findFirst({
      where: { questionId, deletedAt: null },
      include: { course: { select: { name: true } }, topic: { select: { title: true } } },
    });
    if (!row) throw ApiException.notFound("Question");
    return toQuestion(row);
  }

  async create(principal: Principal, input: CreateQuestionInput): Promise<Question> {
    await this.assertCourseAndTopic(input.courseId, input.topicId);

    const row = await this.prisma.questionBank.create({
      data: { ...this.toData(input), createdBy: principal.id },
      include: { course: { select: { name: true } }, topic: { select: { title: true } } },
    });
    return toQuestion(row);
  }

  async update(principal: Principal, questionId: string, input: UpdateQuestionInput): Promise<Question> {
    await this.get(principal, questionId);
    await this.assertCourseAndTopic(input.courseId, input.topicId);

    const row = await this.prisma.questionBank.update({
      where: { questionId },
      data: this.toData(input),
      include: { course: { select: { name: true } }, topic: { select: { title: true } } },
    });
    return toQuestion(row);
  }

  async remove(principal: Principal, questionId: string): Promise<void> {
    await this.get(principal, questionId);
    await this.prisma.questionBank.update({
      where: { questionId },
      data: { deletedAt: new Date(), deletedBy: principal.id },
    });
  }

  /** A topic must belong to the course it is filed under, or the bank lies. */
  private async assertCourseAndTopic(courseId: string, topicId?: string): Promise<void> {
    const course = await this.prisma.course.findFirst({
      where: { courseId, deletedAt: null }, select: { courseId: true },
    });
    if (!course) throw ApiException.validation({ courseId: "That course no longer exists" });

    if (topicId) {
      const topic = await this.prisma.courseTopic.findFirst({
        where: { topicId, courseId, deletedAt: null }, select: { topicId: true },
      });
      if (!topic) throw ApiException.validation({ topicId: "That topic is not part of this course" });
    }
  }

  private toData(input: CreateQuestionInput) {
    return {
      courseId: input.courseId,
      topicId: input.topicId || null,
      questionType: input.questionType,
      difficulty: input.difficulty,
      questionText: input.questionText,
      options: input.options ? (input.options as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      correctAnswers: input.correctAnswers
        ? (input.correctAnswers as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
      explanation: input.explanation || null,
      marks: input.marks,
      tags: input.tags,
    };
  }
}

type QuestionRow = Prisma.QuestionBankGetPayload<{
  include: { course: { select: { name: true } }; topic: { select: { title: true } } };
}>;

function toQuestion(row: QuestionRow): Question {
  return {
    questionId: row.questionId,
    courseId: row.courseId,
    courseName: row.course?.name ?? null,
    topicId: row.topicId,
    topicTitle: row.topic?.title ?? null,
    questionType: row.questionType,
    difficulty: row.difficulty,
    questionText: row.questionText,
    options: (row.options as Question["options"]) ?? null,
    correctAnswers: (row.correctAnswers as string[] | null) ?? null,
    explanation: row.explanation,
    marks: row.marks,
    tags: row.tags,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}
