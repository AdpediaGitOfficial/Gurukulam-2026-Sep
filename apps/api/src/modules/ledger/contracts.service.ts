import { Injectable } from "@nestjs/common";
import { Prisma } from "@gurukulam/db";
import type {
  Contract, ContractQuery, CreateContractInput, Page, Principal,
  SetScheduleInput, UpdateContractInput,
} from "@gurukulam/contracts";
import { PrismaService } from "../prisma/prisma.module";
import { IdService } from "../ids/id.service";
import { ApiException } from "../../common/errors";
import { assertInScope, cityScope, collegeScope, liveOnly } from "../../common/scope/scope";
import { listPage, orderBy, paginate } from "../../common/scope/pagination";
import { withBusinessIdRetry } from "../../common/business-id-retry";
import { parseMoneyField } from "../students/students.service";
import { LedgerService, parseTimestamp } from "./ledger.service";

const SORTABLE = ["createdAt", "contractCode", "status"] as const;

/**
 * College contracts — the institutional billing parent (invariant 3).
 *
 * ADR 0003: both commercial bases are stored, and the contract records WHICH
 * headcount figure it bills on, because headcount drifts between requirement
 * and delivery. `computed_total_minor` and `total_value_minor` are GENERATED
 * columns; nothing here writes to them, and everything downstream reads only
 * `total_value_minor`.
 */
@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdService,
    private readonly ledger: LedgerService,
  ) {}

  async list(principal: Principal, query: ContractQuery): Promise<Page<Contract>> {
    const where: Prisma.CollegeContractWhereInput = {
      ...liveOnly(query.includeDeleted),
      ...collegeScope(principal),
      // A contract carries no city; scope reads through its college.
      college: { ...cityScope(principal), deletedAt: null },
      ...(query.collegeId ? { collegeId: query.collegeId } : {}),
      ...(query.courseId ? { courseId: query.courseId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { contractCode: { contains: query.q, mode: "insensitive" } } : {}),
    };

    return listPage(query, async () => {
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.collegeContract.findMany({
          where,
          orderBy: orderBy(query, SORTABLE, "createdAt"),
          ...paginate(query),
          include: CONTRACT_INCLUDE,
        }),
        this.prisma.collegeContract.count({ where }),
      ]);
      return [rows.map(toContract), total];
    });
  }

  async get(principal: Principal, contractId: string) {
    const contract = await this.prisma.collegeContract.findFirst({
      where: { contractId, deletedAt: null },
      include: {
        ...CONTRACT_INCLUDE,
        installments: { where: { deletedAt: null }, orderBy: { installmentNumber: "asc" } },
      },
    });
    if (!contract) throw ApiException.notFound("Contract");
    assertInScope(principal, { cityId: contract.college.cityId, collegeId: contract.collegeId });

    const enrolledHeadcount = contract.batchId
      ? await this.prisma.studentBatchMapping.count({
          where: { batchId: contract.batchId, deletedAt: null },
        })
      : 0;

    return {
      ...toContract(contract),
      enrolledHeadcount,
      installments: contract.installments.map((i) => ({
        installmentId: i.installmentId,
        installmentNumber: i.installmentNumber,
        amountMinor: i.amountMinor.toString(),
        paidAmountMinor: i.paidAmountMinor.toString(),
        outstandingMinor: (i.amountMinor - i.paidAmountMinor).toString(),
        dueDate: i.dueDate.toISOString().slice(0, 10),
        status: i.status,
      })),
    };
  }

  async create(principal: Principal, input: CreateContractInput) {
    // A college portal user never authors their own contract.
    if (principal.collegeScope !== null) throw ApiException.forbidden();

    const college = await this.prisma.college.findFirst({
      where: { collegeId: input.collegeId, deletedAt: null },
      select: { collegeId: true, cityId: true },
    });
    if (!college) throw ApiException.validation({ collegeId: "That college no longer exists" });
    assertInScope(principal, { cityId: college.cityId, collegeId: college.collegeId });

    const course = await this.prisma.course.findFirst({
      where: { courseId: input.courseId, deletedAt: null },
      select: { courseId: true },
    });
    if (!course) throw ApiException.validation({ courseId: "That course no longer exists" });

    if (input.batchId) {
      const batch = await this.prisma.batch.findFirst({
        where: { batchId: input.batchId, deletedAt: null },
        select: { batchId: true, collegeId: true },
      });
      if (!batch) throw ApiException.validation({ batchId: "That batch no longer exists" });
      // Billing the wrong institution is the failure this prevents.
      if (batch.collegeId !== input.collegeId) {
        throw ApiException.validation({
          batchId: "That batch is not dedicated to this college",
        });
      }
    }

    const money = this.parseCommercials(input);
    const contractCode = await this.ids.contractCode();

    return withBusinessIdRetry(async () => {
      const contract = await this.prisma.collegeContract.create({
        data: {
          contractCode,
          collegeId: input.collegeId,
          courseId: input.courseId,
          requirementId: input.requirementId || null,
          batchId: input.batchId || null,
          commercialBasis: input.commercialBasis,
          perStudentRateMinor: money.perStudentRateMinor,
          flatCohortPriceMinor: money.flatCohortPriceMinor,
          billableHeadcount: input.billableHeadcount,
          headcountBasis: input.headcountBasis,
          overrideTotalMinor: money.overrideTotalMinor,
          overrideReason: input.overrideReason || null,
          notes: input.notes || null,
          createdBy: principal.id,
        },
        include: CONTRACT_INCLUDE,
      });
      // computed_total_minor and total_value_minor were never written — the
      // database derived both.
      return toContract(contract);
    });
  }

  async update(principal: Principal, contractId: string, input: UpdateContractInput) {
    if (principal.collegeScope !== null) throw ApiException.forbidden();
    const existing = await this.mustExist(principal, contractId);

    // Changing what the total is built from, once money has moved against it,
    // silently restates what the college already agreed to pay.
    const touchesCommercials =
      input.perStudentRate !== undefined ||
      input.flatCohortPrice !== undefined ||
      input.billableHeadcount !== undefined ||
      input.overrideTotal !== undefined;

    if (touchesCommercials && existing.totalPaidMinor > 0n) {
      throw ApiException.conflict(
        "Money has already been collected against this contract. Raise a new contract rather " +
          "than restating this one.",
      );
    }

    const overrideTotalMinor =
      input.overrideTotal === undefined
        ? undefined
        : input.overrideTotal === null || input.overrideTotal === ""
          ? null
          : parseMoneyField(input.overrideTotal, "overrideTotal");

    const contract = await this.prisma.collegeContract.update({
      where: { contractId },
      data: {
        ...(input.perStudentRate !== undefined
          ? { perStudentRateMinor: input.perStudentRate ? parseMoneyField(input.perStudentRate, "perStudentRate") : null }
          : {}),
        ...(input.flatCohortPrice !== undefined
          ? { flatCohortPriceMinor: input.flatCohortPrice ? parseMoneyField(input.flatCohortPrice, "flatCohortPrice") : null }
          : {}),
        ...(input.billableHeadcount !== undefined ? { billableHeadcount: input.billableHeadcount } : {}),
        ...(input.headcountBasis !== undefined ? { headcountBasis: input.headcountBasis } : {}),
        ...(overrideTotalMinor !== undefined ? { overrideTotalMinor } : {}),
        ...(input.overrideReason !== undefined ? { overrideReason: input.overrideReason || null } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.signedAt !== undefined ? { signedAt: parseTimestamp(input.signedAt, "signedAt") } : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      },
      include: CONTRACT_INCLUDE,
    });
    return toContract(contract);
  }

  /** The same schedule engine the student ledger uses (invariant 4). */
  async setSchedule(principal: Principal, contractId: string, input: SetScheduleInput) {
    if (principal.collegeScope !== null) throw ApiException.forbidden();
    const contract = await this.mustExist(principal, contractId);

    const total = contract.totalValueMinor;
    if (total === null || total <= 0n) {
      throw ApiException.validation({
        installments: "Set the contract's commercial terms before authoring a schedule",
      });
    }

    return this.ledger.replaceSchedule(principal, input, {
      ledgerId: null,
      contractId,
      totalMinor: total,
      label: "the contract total",
    });
  }

  async remove(principal: Principal, contractId: string): Promise<void> {
    if (principal.collegeScope !== null) throw ApiException.forbidden();
    const contract = await this.mustExist(principal, contractId);

    if (contract.totalPaidMinor > 0n) {
      throw ApiException.conflict(
        "Money has been collected against this contract. Cancel it instead — a receipt is a " +
          "financial record.",
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.feeInstallment.updateMany({
        where: { contractId, deletedAt: null },
        data: { deletedAt: now, deletedBy: principal.id },
      });
      await tx.collegeContract.update({
        where: { contractId },
        data: { deletedAt: now, deletedBy: principal.id },
      });
    });
  }

  private parseCommercials(input: CreateContractInput) {
    const perStudentRateMinor =
      input.commercialBasis === "PER_STUDENT" && input.perStudentRate
        ? parseMoneyField(input.perStudentRate, "perStudentRate")
        : null;
    const flatCohortPriceMinor =
      input.commercialBasis === "FLAT_COHORT" && input.flatCohortPrice
        ? parseMoneyField(input.flatCohortPrice, "flatCohortPrice")
        : null;
    const overrideTotalMinor = input.overrideTotal
      ? parseMoneyField(input.overrideTotal, "overrideTotal")
      : null;
    return { perStudentRateMinor, flatCohortPriceMinor, overrideTotalMinor };
  }

  private async mustExist(principal: Principal, contractId: string) {
    const contract = await this.prisma.collegeContract.findFirst({
      where: { contractId, deletedAt: null },
      include: { college: { select: { cityId: true } } },
    });
    if (!contract) throw ApiException.notFound("Contract");
    assertInScope(principal, { cityId: contract.college.cityId, collegeId: contract.collegeId });
    return contract;
  }
}

const CONTRACT_INCLUDE = {
  college: { select: { name: true, cityId: true } },
  course: { select: { name: true } },
  batch: { select: { batchCode: true } },
  installments: { where: { deletedAt: null }, select: { status: true } },
} satisfies Prisma.CollegeContractInclude;

type ContractRow = Prisma.CollegeContractGetPayload<{ include: typeof CONTRACT_INCLUDE }>;

function toContract(row: ContractRow): Contract {
  return {
    contractId: row.contractId,
    contractCode: row.contractCode,
    collegeId: row.collegeId,
    collegeName: row.college?.name ?? null,
    requirementId: row.requirementId,
    batchId: row.batchId,
    batchCode: row.batch?.batchCode ?? null,
    courseId: row.courseId,
    courseName: row.course?.name ?? null,
    commercialBasis: row.commercialBasis,
    perStudentRateMinor: row.perStudentRateMinor?.toString() ?? null,
    flatCohortPriceMinor: row.flatCohortPriceMinor?.toString() ?? null,
    billableHeadcount: row.billableHeadcount,
    headcountBasis: row.headcountBasis,
    computedTotalMinor: row.computedTotalMinor?.toString() ?? null,
    overrideTotalMinor: row.overrideTotalMinor?.toString() ?? null,
    overrideReason: row.overrideReason,
    totalValueMinor: row.totalValueMinor?.toString() ?? null,
    advanceCollectedMinor: row.advanceCollectedMinor.toString(),
    totalPaidMinor: row.totalPaidMinor.toString(),
    balancePendingMinor: row.balancePendingMinor.toString(),
    status: row.status,
    signedAt: row.signedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    installmentsPaid: row.installments.filter((i) => i.status === "PAID").length,
    installmentsTotal: row.installments.length,
  };
}
