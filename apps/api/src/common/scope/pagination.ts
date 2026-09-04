import type { PageQuery, Page } from "@gurukulam/contracts";
import { toPage } from "@gurukulam/contracts";

/** Prisma's skip/take from a validated page query. */
export const paginate = (query: PageQuery) => ({
  skip: (query.page - 1) * query.pageSize,
  take: query.pageSize,
});

/**
 * Sorting, restricted to columns the endpoint declares.
 *
 * An unrecognised `sort` falls back to the default rather than erroring: a
 * stale bookmark should still render the list. Passing the value straight to
 * Prisma would let a caller order by a column the endpoint never meant to
 * expose, and on a large table that is a cheap way to probe for one.
 */
export function orderBy<TField extends string>(
  query: PageQuery,
  allowed: readonly TField[],
  fallback: TField,
): Record<string, "asc" | "desc"> {
  const field = allowed.includes(query.sort as TField) ? (query.sort as TField) : fallback;
  return { [field]: query.order };
}

/** Runs the count and the page in one round trip and wraps the envelope. */
export async function listPage<TRow>(
  query: PageQuery,
  run: () => Promise<[TRow[], number]>,
): Promise<Page<TRow>> {
  const [rows, total] = await run();
  return toPage(rows, total, query);
}
