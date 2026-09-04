import "server-only";

import { pageOf, type Page } from "@gurukulam/contracts";
import type { z } from "zod";

import { apiFetch } from "./api";

/** What a Next.js page receives. Values are strings because they came from a URL. */
export type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Filters and pagination live in `searchParams`, so a filtered view is
 * shareable and the page stays server-rendered.
 *
 * Only the keys a module declares are forwarded. An unrecognised parameter is
 * dropped rather than passed through — the API validates its own query, but a
 * console that forwarded anything would let a crafted URL probe for parameters
 * the UI never offers.
 */
export function queryString(params: SearchParams, allowed: readonly string[]): string {
  const query = new URLSearchParams();
  for (const key of allowed) {
    const value = params[key];
    // A repeated parameter (`?status=A&status=B`) arrives as an array. These
    // filters are single-valued, so take the first rather than joining them
    // into a string no filter would match.
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined && first !== "") query.set(key, first);
  }
  const text = query.toString();
  return text === "" ? "" : `?${text}`;
}

/**
 * Fetches one page of a collection, parsed against the row contract.
 *
 * Parsing rather than casting is the point: a response that has drifted from
 * the contract fails here with the field named, instead of rendering as
 * `undefined` three components down.
 */
export async function fetchPage<TRow extends z.ZodTypeAny>(
  path: string,
  row: TRow,
  params: SearchParams,
  allowed: readonly string[],
): Promise<Page<z.infer<TRow>>> {
  const response = await apiFetch(`${path}${queryString(params, allowed)}`);
  return pageOf(row).parse(response) as Page<z.infer<TRow>>;
}

/** Every list endpoint accepts these on top of its own filters. */
export const PAGE_KEYS = ["page", "pageSize", "q", "sort", "order"] as const;
