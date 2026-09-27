import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from "@nestjs/common";
import {
  cityQuerySchema, countryQuerySchema, createCitySchema, createCountrySchema,
  updateCitySchema, updateCountrySchema,
  type CityQuery, type CountryQuery, type CreateCityInput, type CreateCountryInput,
  type Principal, type UpdateCityInput, type UpdateCountryInput,
} from "@gurukulam/contracts";
import { LocalisationService } from "./localisation.service";
import { zodBody } from "../../common/pipes/zod-validation.pipe";
import { CurrentPrincipal, RequirePermission } from "../../common/decorators/principal.decorator";

/** Set-up-once configuration, filed under Settings. */
@Controller("localisation")
export class LocalisationController {
  constructor(private readonly localisation: LocalisationService) {}

  @Get("countries")
  @RequirePermission("settings", "read")
  listCountries(@CurrentPrincipal() p: Principal, @Query(zodBody(countryQuerySchema)) q: CountryQuery) {
    return this.localisation.listCountries(p, q);
  }

  @Get("countries/:countryId")
  @RequirePermission("settings", "read")
  getCountry(@CurrentPrincipal() p: Principal, @Param("countryId") id: string) {
    return this.localisation.getCountry(p, id);
  }

  @Post("countries")
  @RequirePermission("settings", "edit")
  createCountry(@CurrentPrincipal() p: Principal, @Body(zodBody(createCountrySchema)) body: CreateCountryInput) {
    return this.localisation.createCountry(p, body);
  }

  @Patch("countries/:countryId")
  @RequirePermission("settings", "edit")
  updateCountry(@CurrentPrincipal() p: Principal, @Param("countryId") id: string, @Body(zodBody(updateCountrySchema)) body: UpdateCountryInput) {
    return this.localisation.updateCountry(p, id, body);
  }

  @Delete("countries/:countryId")
  @RequirePermission("settings", "delete")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeCountry(@CurrentPrincipal() p: Principal, @Param("countryId") id: string): Promise<void> {
    await this.localisation.removeCountry(p, id);
  }

  @Get("cities")
  @RequirePermission("settings", "read")
  listCities(@CurrentPrincipal() p: Principal, @Query(zodBody(cityQuerySchema)) q: CityQuery) {
    return this.localisation.listCities(p, q);
  }

  @Get("cities/:cityId")
  @RequirePermission("settings", "read")
  getCity(@CurrentPrincipal() p: Principal, @Param("cityId") id: string) {
    return this.localisation.getCity(p, id);
  }

  @Post("cities")
  @RequirePermission("settings", "edit")
  createCity(@CurrentPrincipal() p: Principal, @Body(zodBody(createCitySchema)) body: CreateCityInput) {
    return this.localisation.createCity(p, body);
  }

  @Patch("cities/:cityId")
  @RequirePermission("settings", "edit")
  updateCity(@CurrentPrincipal() p: Principal, @Param("cityId") id: string, @Body(zodBody(updateCitySchema)) body: UpdateCityInput) {
    return this.localisation.updateCity(p, id, body);
  }

  /** Guarded: operators are scoped to cities, so removing one is not a tidy-up. */
  @Delete("cities/:cityId")
  @RequirePermission("settings", "delete")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeCity(@CurrentPrincipal() p: Principal, @Param("cityId") id: string): Promise<void> {
    await this.localisation.removeCity(p, id);
  }
}
