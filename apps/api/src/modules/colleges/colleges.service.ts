import { Injectable } from "@nestjs/common";
import { Prisma } from "@gurukulam/db";
import type {
  College, CollegeQuery, CreateCollegeInput, Page, Principal, ReplacePocsInput, UpdateCollegeInput,
  CollegeDetail,
} from "@gurukulam/contracts";
import { PrismaService } from "../prisma/prisma.module";
import { IdService } from "../ids/id.service";
import { ApiException } from "../../common/errors";
import { withBusinessIdRetry } from "../../common/business-id-retry";
import { assertInScope, cityScope, collegeScope, liveOnly } from "../../common/scope/scope";
import { listPage, orderBy, paginate } from "../../common/scope/pagination";

const SORTABLE = ["name", "collegeCode", "createdAt"] as const;

/**
 * The institutional CRM. A college is an actor, not a directory row.
 *
 * This module is scoped on BOTH axes, and it is the one where getting that
 * wrong matters most:
 *   · a regional sub-admin sees only colleges in their cities;
 *   · a college portal user sees exactly one college — their own.
 *
 * Both are the same mechanism applied to different columns, which is the point
 * of modelling college users as principals rather than a parallel system.
 */
@Injectable()
export class CollegesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdService,
  ) {}

  async list(principal: Principal, query: CollegeQuery): Promise<Page<College>> {
    const where: Prisma.CollegeWhereInput = {
      ...liveOnly(query.includeDeleted),
      ...cityScope(principal),
      // A college user's own college id IS the college's primary key here, not
      // a foreign key — so the college-scope column differs on this table.
      ...collegeScope(principal, "collegeId"),
      ...(query.cityId ? { cityId: query.cityId } : {}),
      ...(query.discipline ? { disciplines: { has: query.discipline } } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: "insensitive" } },
              { shortName: { contains: query.q, mode: "insensitive" } },
              { collegeCode: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    return listPage(query, async () => {
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.college.findMany({
          where,
          orderBy: orderBy(query, SORTABLE, "name"),
          ...paginate(query),
          include: {
            city: { select: { name: true } },
            _count: { select: { pocs: true, students: true, batches: true } },
          },
        }),
        this.prisma.college.count({ where }),
      ]);
      return [rows.map(toCollege), total];
    });
  }

  async get(principal: Principal, collegeId: string): Promise<CollegeDetail> {
    const college = await this.prisma.college.findFirst({
      where: { collegeId, deletedAt: null },
      include: {
        city: { select: { name: true } },
        _count: { select: { pocs: true, students: true, batches: true } },
        pocs: { where: { deletedAt: null }, orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
      },
    });
    if (!college) throw ApiException.notFound("College");
    this.assertVisible(principal, college);

    const openRequirementCount = await this.prisma.collegeRequirement.count({
      where: { collegeId, deletedAt: null, status: { in: ["NEW", "UNDER_REVIEW", "CONFIRMED"] } },
    });

    return {
      ...toCollege(college),
      openRequirementCount,
      pocs: college.pocs.map((p) => ({
        pocId: p.pocId, collegeId: p.collegeId, name: p.name,
        designation: p.designation, department: p.department,
        email: p.email, phone: p.phone, isPrimary: p.isPrimary,
      })),
    };
  }

  async create(principal: Principal, input: CreateCollegeInput) {
    // A college portal user can never create a college — theirs already
    // exists, and creating another would be outside any scope they hold.
    if (principal.collegeScope !== null) throw ApiException.forbidden();
    assertInScope(principal, { cityId: input.cityId });

    const city = await this.prisma.city.findFirst({
      where: { cityId: input.cityId, deletedAt: null },
      select: { cityId: true, countryId: true },
    });
    if (!city) throw ApiException.validation({ cityId: "That city no longer exists" });
    if (city.countryId !== input.countryId) {
      throw ApiException.validation({ cityId: "That city is not in the selected country" });
    }

    const primaries = input.pocs.filter((p) => p.isPrimary).length;
    if (primaries > 1) {
      throw ApiException.validation({ pocs: "Only one contact can be the primary" });
    }

    return withBusinessIdRetry(async () => {
      const collegeCode = await this.ids.collegeCode(input.name);
      return this.prisma.$transaction(async (tx) => {
      const college = await tx.college.create({
        data: {
          collegeCode,
          name: input.name,
          shortName: input.shortName || null,
          countryId: input.countryId,
          cityId: input.cityId,
          addressLine1: input.addressLine1 || null,
          addressLine2: input.addressLine2 || null,
          postalCode: input.postalCode || null,
          website: input.website || null,
          affiliation: input.affiliation || null,
          disciplines: input.disciplines,
          notes: input.notes || null,
          createdBy: principal.id,
          pocs: {
            create: input.pocs.map((p) => ({
              name: p.name,
              designation: p.designation || null,
              department: p.department || null,
              email: p.email,
              phone: p.phone || null,
              isPrimary: p.isPrimary,
              createdBy: principal.id,
            })),
          },
        },
        include: {
          city: { select: { name: true } },
          _count: { select: { pocs: true, students: true, batches: true } },
        },
      });
        return toCollege(college);
      });
    });
  }

  async update(principal: Principal, collegeId: string, input: UpdateCollegeInput) {
    await this.mustExist(principal, collegeId);

    if (input.cityId) {
      // Moving a college between cities can move it out of the operator's own
      // scope. Checking the DESTINATION stops a scoped operator pushing a
      // record somewhere they can no longer see or undo.
      assertInScope(principal, { cityId: input.cityId });
      const city = await this.prisma.city.findFirst({
        where: { cityId: input.cityId, deletedAt: null },
        select: { cityId: true, countryId: true },
      });
      if (!city) throw ApiException.validation({ cityId: "That city no longer exists" });
      // Same pairing check as create: the two arrive together and a mismatched
      // pair would leave the college in a country its city is not in.
      if (input.countryId !== undefined && city.countryId !== input.countryId) {
        throw ApiException.validation({ cityId: "That city is not in the selected country" });
      }
    }

    const college = await this.prisma.college.update({
      where: { collegeId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.shortName !== undefined ? { shortName: input.shortName || null } : {}),
        ...(input.cityId !== undefined ? { cityId: input.cityId } : {}),
        ...(input.countryId !== undefined ? { countryId: input.countryId } : {}),
        ...(input.addressLine1 !== undefined ? { addressLine1: input.addressLine1 || null } : {}),
        ...(input.addressLine2 !== undefined ? { addressLine2: input.addressLine2 || null } : {}),
        ...(input.postalCode !== undefined ? { postalCode: input.postalCode || null } : {}),
        ...(input.website !== undefined ? { website: input.website || null } : {}),
        ...(input.affiliation !== undefined ? { affiliation: input.affiliation || null } : {}),
        ...(input.disciplines !== undefined ? { disciplines: input.disciplines } : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: {
        city: { select: { name: true } },
        _count: { select: { pocs: true, students: true, batches: true } },
      },
    });
    return toCollege(college);
  }

  /**
   * The college's contacts, as one list.
   *
   * A DIFF, not a wholesale replacement. `college_users.poc_id` is a foreign
   * key — a portal account is linked to the person it belongs to — so a
   * contact that merely had its phone corrected must keep the id it already
   * has. Soft-deleting the lot and re-creating it would leave every portal
   * account pointing at a deleted row while the person is still on the list.
   *
   * A contact carrying a `pocId` is an edit, one without is new, and a live
   * contact the list omits is the only thing that gets removed.
   */
  async replacePocs(principal: Principal, collegeId: string, input: ReplacePocsInput) {
    await this.mustExist(principal, collegeId);

    if (input.pocs.filter((p) => p.isPrimary).length > 1) {
      throw ApiException.validation({ pocs: "Only one contact can be the primary" });
    }

    const existing = await this.prisma.collegePoc.findMany({
      where: { collegeId, deletedAt: null },
      select: { pocId: true },
    });
    const live = new Set(existing.map((p) => p.pocId));

    const named = input.pocs.filter((p) => p.pocId !== undefined).map((p) => p.pocId as string);
    // An id from another college — or one already removed — would otherwise
    // re-parent someone else's contact, or revive a deleted one by accident.
    const stranger = named.find((id) => !live.has(id));
    if (stranger !== undefined) {
      throw ApiException.validation({ pocs: "One of those contacts is no longer on this college" });
    }
    if (new Set(named).size !== named.length) {
      throw ApiException.validation({ pocs: "The same contact appears twice" });
    }

    const kept = new Set(named);

    return this.prisma.$transaction(async (tx) => {
      const removed = [...live].filter((id) => !kept.has(id));
      if (removed.length > 0) {
        // Soft-deleted rather than erased: a college_user may point at this
        // contact, and a certificate submission records who sent it.
        await tx.collegePoc.updateMany({
          where: { pocId: { in: removed } },
          data: { deletedAt: new Date(), deletedBy: principal.id },
        });
      }

      for (const poc of input.pocs) {
        const data = {
          name: poc.name,
          designation: poc.designation || null,
          department: poc.department || null,
          email: poc.email,
          phone: poc.phone || null,
          isPrimary: poc.isPrimary,
        };
        if (poc.pocId === undefined) {
          await tx.collegePoc.create({
            data: { ...data, collegeId, createdBy: principal.id },
          });
        } else {
          await tx.collegePoc.update({ where: { pocId: poc.pocId }, data });
        }
      }

      return tx.collegePoc.findMany({
        where: { collegeId, deletedAt: null },
        orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
      });
    });
  }

  async remove(principal: Principal, collegeId: string): Promise<void> {
    if (principal.collegeScope !== null) throw ApiException.forbidden();
    await this.mustExist(principal, collegeId);

    const [students, batches] = await this.prisma.$transaction([
      this.prisma.student.count({ where: { collegeId, deletedAt: null } }),
      this.prisma.batch.count({
        where: { collegeId, deletedAt: null, status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
      }),
    ]);
    if (students > 0 || batches > 0) {
      throw ApiException.conflict(
        `This college still has ${students} student${students === 1 ? "" : "s"} and ` +
          `${batches} active batch${batches === 1 ? "" : "es"}.`,
      );
    }

    await this.prisma.college.update({
      where: { collegeId },
      data: { deletedAt: new Date(), deletedBy: principal.id },
    });
  }

  private async mustExist(principal: Principal, collegeId: string) {
    const college = await this.prisma.college.findFirst({
      where: { collegeId, deletedAt: null },
    });
    if (!college) throw ApiException.notFound("College");
    this.assertVisible(principal, college);
    return college;
  }

  /**
   * A college's OWN id is the college-scope key, so `assertInScope` — which
   * reads `row.collegeId` — does not apply here without the translation.
   */
  private assertVisible(principal: Principal, college: { cityId: string; collegeId: string }): void {
    assertInScope(principal, { cityId: college.cityId, collegeId: college.collegeId });
  }
}

type CollegeRow = Prisma.CollegeGetPayload<{
  include: {
    city: { select: { name: true } };
    _count: { select: { pocs: true; students: true; batches: true } };
  };
}>;

function toCollege(row: CollegeRow): College {
  return {
    collegeId: row.collegeId,
    collegeCode: row.collegeCode,
    name: row.name,
    shortName: row.shortName,
    countryId: row.countryId,
    cityId: row.cityId,
    cityName: row.city?.name ?? null,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    postalCode: row.postalCode,
    website: row.website,
    affiliation: row.affiliation,
    disciplines: row.disciplines,
    notes: row.notes,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    pocCount: row._count.pocs,
    studentCount: row._count.students,
    batchCount: row._count.batches,
  };
}
