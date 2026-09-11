import type { Route } from "next";

export type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The same URL with one parameter changed.
 *
 * Filters live in the query string, so every control that narrows a list is a
 * link — which is what keeps a filtered view shareable and the page server-
 * rendered.
 */
export function withParam(
  pathname: string,
  params: SearchParams,
  key: string,
  value: string | undefined,
): Route {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    const first = Array.isArray(v) ? v[0] : v;
    if (first !== undefined && first !== "") next.set(k, first);
  }

  if (value === undefined || value === "") next.delete(key);
  else next.set(key, value);

  // Changing a filter invalidates the current page number — page 7 of the old
  // result set is rarely page 7 of the new one, and is often past its end.
  if (key !== "page") next.delete("page");

  const query = next.toString();
  return (query === "" ? pathname : `${pathname}?${query}`) as Route;
}

/** "Showing 1–25 of 342" — the summary above a pager. */
export function pageSummary(page: number, pageSize: number, total: number): string {
  if (total === 0) return "No records";
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return `Showing ${first.toLocaleString("en-IN")}–${last.toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")}`;
}
