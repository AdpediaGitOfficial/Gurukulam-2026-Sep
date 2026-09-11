import { z } from "zod";
import { pageQuerySchema, queryBoolean } from "../common/page.js";

/**
 * Localisation — set-up-once configuration that sits under Settings.
 *
 * Cities are not merely a directory: a city is the unit a regional sub-admin
 * is scoped to, so adding or archiving one changes what operators can see.
 */
export const countrySchema = z.object({
  countryId: z.string(),
  countryCode: z.string(),
  name: z.string(),
  iso2: z.string(),
  iso3: z.string(),
  dialCode: z.string(),
  currency: z.string(),
  timezone: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
  cityCount: z.number().int().optional(),
});

export type Country = z.infer<typeof countrySchema>;

export const citySchema = z.object({
  cityId: z.string(),
  cityCode: z.string(),
  countryId: z.string(),
  countryName: z.string().nullable().optional(),
  name: z.string(),
  state: z.string().nullable(),
  timezone: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
  collegeCount: z.number().int().optional(),
  studentCount: z.number().int().optional(),
});

export type City = z.infer<typeof citySchema>;

export const countryQuerySchema = pageQuerySchema.extend({ isActive: queryBoolean.optional() });
export const cityQuerySchema = pageQuerySchema.extend({
  countryId: z.string().optional(),
  isActive: queryBoolean.optional(),
});

export type CountryQuery = z.infer<typeof countryQuerySchema>;
export type CityQuery = z.infer<typeof cityQuerySchema>;

export const createCountrySchema = z.object({
  name: z.string().trim().min(1, "Enter the country name").max(120),
  iso2: z.string().trim().length(2, "ISO-2 is exactly two letters").toUpperCase(),
  iso3: z.string().trim().length(3, "ISO-3 is exactly three letters").toUpperCase(),
  dialCode: z.string().trim().regex(/^\+\d{1,6}$/, "Enter a dial code like +91"),
  currency: z.string().trim().length(3, "Currency is a three-letter code").toUpperCase(),
  timezone: z.string().trim().min(1, "Choose a timezone").max(64),
});

export type CreateCountryInput = z.infer<typeof createCountrySchema>;

export const updateCountrySchema = createCountrySchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateCountryInput = z.infer<typeof updateCountrySchema>;

export const createCitySchema = z.object({
  countryId: z.string().min(1, "Select a country"),
  name: z.string().trim().min(1, "Enter the city name").max(120),
  state: z.string().trim().max(120).optional(),
  timezone: z.string().trim().max(64).optional(),
});

export type CreateCityInput = z.infer<typeof createCitySchema>;

export const updateCitySchema = createCitySchema.partial().omit({ countryId: true }).extend({
  isActive: z.boolean().optional(),
});
export type UpdateCityInput = z.infer<typeof updateCitySchema>;
