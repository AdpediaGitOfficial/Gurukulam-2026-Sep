import "server-only";

import { citySchema, countrySchema, type City, type Country, type Page } from "@gurukulam/contracts";

import { fetchPage, PAGE_KEYS, type SearchParams } from "@/server/list";

export const COUNTRY_FILTERS = [...PAGE_KEYS, "isActive"] as const;
export const CITY_FILTERS = [...PAGE_KEYS, "countryId", "isActive"] as const;

/**
 * Set-up-once configuration, which is why it sits under Settings rather than
 * holding a rail slot of its own.
 *
 * Cities are not merely a label: a city scopes a regional sub-admin's access,
 * so the list is also the vocabulary the permission model draws on.
 */
export async function listCountries(params: SearchParams): Promise<Page<Country>> {
  return fetchPage("/localisation/countries", countrySchema, params, COUNTRY_FILTERS);
}

export async function listCities(params: SearchParams): Promise<Page<City>> {
  return fetchPage("/localisation/cities", citySchema, params, CITY_FILTERS);
}
