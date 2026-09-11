import { z } from "zod";

/**
 * Every list endpoint returns this shape, so the console's searchParams-driven
 * filtering maps onto query params with nothing to reshape, and a mobile list
 * pages the same way a web table does.
 */
/**
 * A boolean from a query string.
 *
 * NOT `z.coerce.boolean()`: that runs JavaScript's `Boolean()`, and every
 * non-empty string is truthy — so `?includeDeleted=false` parses as TRUE and
 * an operational read starts returning soft-deleted rows. A UI that always
 * sends the parameter explicitly is exactly the case that breaks.
 */
export const queryBoolean = z
  .union([z.boolean(), z.string(), z.number()])
  .transform((value) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    const text = value.trim().toLowerCase();
    return text === "true" || text === "1" || text === "yes" || text === "on";
  });

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  /** Free-text search. What it searches is the endpoint's business. */
  q: z.string().trim().min(1).max(200).optional(),
  sort: z.string().max(60).optional(),
  order: z.enum(["asc", "desc"]).default("asc"),
  /**
   * Include soft-deleted rows (ADR 0002). Operational reads leave this off;
   * financial and historical reports opt in, because the events they record
   * still happened. Requires the caller's permission on the module.
   */
  includeDeleted: queryBoolean.default(false),
});

export type PageQuery = z.infer<typeof pageQuerySchema>;

/** Wraps a row schema into the paged envelope. */
export function pageOf<T extends z.ZodTypeAny>(row: T) {
  return z.object({
    rows: z.array(row),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
    totalPages: z.number().int(),
  });
}

export interface Page<TRow> {
  rows: TRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Builds the envelope so no endpoint recomputes totalPages incorrectly. */
export function toPage<TRow>(
  rows: TRow[],
  total: number,
  query: Pick<PageQuery, "page" | "pageSize">,
): Page<TRow> {
  return {
    rows,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}
