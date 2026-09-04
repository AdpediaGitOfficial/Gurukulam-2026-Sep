import { Injectable } from "@nestjs/common";
import { Prisma } from "@gurukulam/db";
import { cityCode, countryCode } from "@gurukulam/contracts";
import type {
  City, CityQuery, Country, CountryQuery, CreateCityInput, CreateCountryInput,
  Page, Principal, UpdateCityInput, UpdateCountryInput,
} from "@gurukulam/contracts";
import { PrismaService } from "../prisma/prisma.module";
import { ApiException } from "../../common/errors";
import { liveOnly } from "../../common/scope/scope";
import { listPage, orderBy, paginate } from "../../common/scope/pagination";
import { withBusinessIdRetry } from "../../common/business-id-retry";

/**
 * Localisation — set-up-once configuration under Settings.
 *
 * A city is not a directory row: it is the unit a regional sub-admin is scoped
 * TO. Archiving one narrows what those operators can see, and deleting one
 * with colleges or students behind it would strand every scope that names it.
 * Both are guarded below.
 *
 * Reads are deliberately unscoped — every operator needs the full list to pick
 * from, and a city name is not confidential.
 */
@Injectable()
export class LocalisationService {
  constructor(private readonly prisma: PrismaService) {}

  async listCountries(_p: Principal, query: CountryQuery): Promise<Page<Country>> {
    const where: Prisma.CountryWhereInput = {
      ...liveOnly(query.includeDeleted),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: "insensitive" } },
              { iso2: { contains: query.q, mode: "insensitive" } },
              { iso3: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    return listPage(query, async () => {
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.country.findMany({
          where,
          orderBy: orderBy(query, ["name", "countryCode", "createdAt"] as const, "name"),
          ...paginate(query),
          include: { _count: { select: { cities: { where: { deletedAt: null } } } } },
        }),
        this.prisma.country.count({ where }),
      ]);
      return [rows.map(toCountry), total];
    });
  }

  /** One country, for the edit form. Reads are unscoped, as above. */
  async getCountry(_p: Principal, countryId: string): Promise<Country> {
    const row = await this.prisma.country.findFirst({
      where: { countryId, deletedAt: null },
      include: { _count: { select: { cities: { where: { deletedAt: null } } } } },
    });
    if (!row) throw ApiException.notFound("Country");
    return toCountry(row);
  }

  /**
   * Creating a country, or REVIVING one that was archived.
   *
   * `country_code` is a business ID derived from the ISO-2, so it carries an
   * unconditional unique constraint and is never reused (ADR 0002). That makes
   * a plain insert wrong here: archiving India and later re-adding it would
   * hit the constraint and surface as a 500, leaving the ISO code permanently
   * unusable. There is only one India, so the archived row IS the record being
   * asked for — it is restored rather than duplicated.
   */
  async createCountry(principal: Principal, input: CreateCountryInput): Promise<Country> {
    const existing = await this.prisma.country.findFirst({
      where: { iso2: input.iso2 },
      select: { countryId: true, deletedAt: true },
    });

    if (existing?.deletedAt === null) {
      throw ApiException.conflict("That country already exists", { iso2: "Already in use" });
    }

    if (existing) {
      const revived = await this.prisma.country.update({
        where: { countryId: existing.countryId },
        data: {
          deletedAt: null,
          deletedBy: null,
          isActive: true,
          name: input.name,
          iso3: input.iso3,
          dialCode: input.dialCode,
          currency: input.currency,
          timezone: input.timezone,
        },
        include: { _count: { select: { cities: { where: { deletedAt: null } } } } },
      });
      return toCountry(revived);
    }

    return withBusinessIdRetry(async () => {
      const country = await this.prisma.country.create({
        data: {
          countryCode: countryCode(input.iso2),
          name: input.name,
          iso2: input.iso2,
          iso3: input.iso3,
          dialCode: input.dialCode,
          currency: input.currency,
          timezone: input.timezone,
          createdBy: principal.id,
        },
        include: { _count: { select: { cities: { where: { deletedAt: null } } } } },
      });
      return toCountry(country);
    });
  }

  async updateCountry(principal: Principal, countryId: string, input: UpdateCountryInput) {
    await this.mustFindCountry(countryId);
    void principal;
    const country = await this.prisma.country.update({
      where: { countryId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.iso3 !== undefined ? { iso3: input.iso3 } : {}),
        ...(input.dialCode !== undefined ? { dialCode: input.dialCode } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: { _count: { select: { cities: { where: { deletedAt: null } } } } },
    });
    // iso2 is absent: countryCode is derived from it and is immutable.
    return toCountry(country);
  }

  async removeCountry(principal: Principal, countryId: string): Promise<void> {
    await this.mustFindCountry(countryId);
    const cities = await this.prisma.city.count({ where: { countryId, deletedAt: null } });
    if (cities > 0) {
      throw ApiException.conflict(
        `This country still has ${cities} cit${cities === 1 ? "y" : "ies"}. Archive those first.`,
      );
    }
    await this.prisma.country.update({
      where: { countryId },
      data: { deletedAt: new Date(), deletedBy: principal.id },
    });
  }

  async listCities(_p: Principal, query: CityQuery): Promise<Page<City>> {
    const where: Prisma.CityWhereInput = {
      ...liveOnly(query.includeDeleted),
      ...(query.countryId ? { countryId: query.countryId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: "insensitive" } },
              { cityCode: { contains: query.q, mode: "insensitive" } },
              { state: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    return listPage(query, async () => {
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.city.findMany({
          where,
          orderBy: orderBy(query, ["name", "cityCode", "createdAt"] as const, "name"),
          ...paginate(query),
          include: CITY_INCLUDE,
        }),
        this.prisma.city.count({ where }),
      ]);
      return [rows.map(toCity), total];
    });
  }

  /** One city, for the edit form. */
  async getCity(_p: Principal, cityId: string): Promise<City> {
    const row = await this.prisma.city.findFirst({
      where: { cityId, deletedAt: null },
      include: CITY_INCLUDE,
    });
    if (!row) throw ApiException.notFound("City");
    return toCity(row);
  }

  async createCity(principal: Principal, input: CreateCityInput): Promise<City> {
    const country = await this.prisma.country.findFirst({
      where: { countryId: input.countryId, deletedAt: null },
      select: { countryId: true, timezone: true },
    });
    if (!country) throw ApiException.validation({ countryId: "That country no longer exists" });

    return withBusinessIdRetry(async () => {
      const city = await this.prisma.city.create({
        data: {
          cityCode: await this.freeCityCode(input.name),
          countryId: input.countryId,
          name: input.name,
          state: input.state || null,
          // A city inherits its country's timezone unless told otherwise —
          // most do, and an unset one breaks session scheduling silently.
          timezone: input.timezone || country.timezone,
          createdBy: principal.id,
        },
        include: CITY_INCLUDE,
      });
      return toCity(city);
    });
  }

  async updateCity(principal: Principal, cityId: string, input: UpdateCityInput) {
    await this.mustFindCity(cityId);
    void principal;
    const city = await this.prisma.city.update({
      where: { cityId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.state !== undefined ? { state: input.state || null } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone || null } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: CITY_INCLUDE,
    });
    return toCity(city);
  }

  /**
   * Archiving a city is not a directory tidy-up: operators are scoped to
   * cities, so removing one that still has records behind it would leave those
   * records reachable by nobody except a global admin.
   */
  async removeCity(principal: Principal, cityId: string): Promise<void> {
    await this.mustFindCity(cityId);

    const [colleges, students, batches, trainers, scopedAdmins] = await this.prisma.$transaction([
      this.prisma.college.count({ where: { cityId, deletedAt: null } }),
      this.prisma.student.count({ where: { cityId, deletedAt: null } }),
      this.prisma.batch.count({ where: { cityId, deletedAt: null } }),
      this.prisma.trainer.count({ where: { cityId, deletedAt: null } }),
      this.prisma.adminUser.count({ where: { cityScope: { has: cityId }, deletedAt: null } }),
    ]);

    const held = [
      colleges && `${colleges} college${colleges === 1 ? "" : "s"}`,
      students && `${students} student${students === 1 ? "" : "s"}`,
      batches && `${batches} batch${batches === 1 ? "" : "es"}`,
      trainers && `${trainers} trainer${trainers === 1 ? "" : "s"}`,
    ].filter(Boolean);

    if (held.length > 0) {
      throw ApiException.conflict(`This city still has ${held.join(", ")}.`);
    }
    if (scopedAdmins > 0) {
      // Their scope would silently become an empty list, which fails closed —
      // correct, but they would simply see nothing with no explanation.
      throw ApiException.conflict(
        `${scopedAdmins} operator${scopedAdmins === 1 ? " is" : "s are"} scoped to this city. ` +
          "Reassign them first.",
      );
    }

    await this.prisma.city.update({
      where: { cityId },
      data: { deletedAt: new Date(), deletedBy: principal.id },
    });
  }

  /** CITY-BLR, with a numeric suffix if those initials are taken. */
  private async freeCityCode(name: string): Promise<string> {
    const base = cityCode(name);
    for (let n = 0; n < 50; n++) {
      const candidate = n === 0 ? base : `${base}${n + 1}`;
      const taken = await this.prisma.city.findFirst({
        where: { cityCode: candidate },
        select: { cityId: true },
      });
      if (!taken) return candidate;
    }
    throw ApiException.conflict("Could not derive a free city code for that name");
  }

  private async mustFindCountry(countryId: string) {
    const found = await this.prisma.country.findFirst({
      where: { countryId, deletedAt: null }, select: { countryId: true },
    });
    if (!found) throw ApiException.notFound("Country");
    return found;
  }

  private async mustFindCity(cityId: string) {
    const found = await this.prisma.city.findFirst({
      where: { cityId, deletedAt: null }, select: { cityId: true },
    });
    if (!found) throw ApiException.notFound("City");
    return found;
  }
}

const CITY_INCLUDE = {
  country: { select: { name: true } },
  _count: {
    select: {
      colleges: { where: { deletedAt: null } },
      students: { where: { deletedAt: null } },
    },
  },
} satisfies Prisma.CityInclude;

function toCountry(row: Prisma.CountryGetPayload<{ include: { _count: { select: { cities: true } } } }>): Country {
  return {
    countryId: row.countryId,
    countryCode: row.countryCode,
    name: row.name,
    iso2: row.iso2,
    iso3: row.iso3,
    dialCode: row.dialCode,
    currency: row.currency,
    timezone: row.timezone,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    cityCount: row._count.cities,
  };
}

function toCity(row: Prisma.CityGetPayload<{ include: typeof CITY_INCLUDE }>): City {
  return {
    cityId: row.cityId,
    cityCode: row.cityCode,
    countryId: row.countryId,
    countryName: row.country?.name ?? null,
    name: row.name,
    state: row.state,
    timezone: row.timezone,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    collegeCount: row._count.colleges,
    studentCount: row._count.students,
  };
}
