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
 *
 * `tiebreaker` is required, and names a UNIQUE column. Sorting by a column
 * with duplicate values leaves the order of the tied rows undefined, and
 * Postgres is free to return them differently for each page — which shows up
 * as a row appearing on two pages while another is never listed at all. Twenty
 * of our twenty-one seeded college contacts are called "T&P Officer", so this
 * is not a theoretical concern. A unique final key makes the total order
 * deterministic, and costs nothing when the leading column has no ties.
 */
export function orderBy<TField extends string>(
  query: PageQuery,
  allowed: readonly TField[],
  fallback: TField,
  tiebreaker: string,
): Record<string, "asc" | "desc">[] {
  const field = allowed.includes(query.sort as TField) ? (query.sort as TField) : fallback;
  return field === tiebreaker
    ? [{ [field]: query.order }]
    : [{ [field]: query.order }, { [tiebreaker]: query.order }];
}

/** Runs the count and the page in one round trip and wraps the envelope. */
export async function listPage<TRow>(
  query: PageQuery,
  run: () => Promise<[TRow[], number]>,
): Promise<Page<TRow>> {
  const [rows, total] = await run();
  return toPage(rows, total, query);
}
