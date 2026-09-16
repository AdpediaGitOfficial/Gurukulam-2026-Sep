import "server-only";

import { pageOf, type Page } from "@gurukulam/contracts";
import type { z } from "zod";

import { apiFetch } from "./api";

/** What a Next.js page receives. Values are strings because they came from a URL. */
export type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The module's own query contract, used here to check VALUES.
 *
 * It is the same schema the API validates the request against, imported from
 * `@gurukulam/contracts` — not a second list maintained alongside it, which
 * would drift on exactly the enum that matters.
 */
export type QueryContract = {
  safeParse: (value: unknown) => z.ZodSafeParseResult<unknown>;
};

/**
 * Drops filter values the API would reject, so a bad one reads as "no filter".
 *
 * The key allow-list below stops a crafted URL reaching a parameter the UI
 * never offers. It does NOT stop a crafted VALUE, and for a long time nothing
 * did: `?status=pending` on a screen whose statuses are DRAFT, ISSUED and
 * REVOKED was forwarded verbatim, the API answered 400 VALIDATION_FAILED, and
 * the whole page 500-ed. A filter nobody can express is not worth a blank
 * screen — an unusable value is dropped exactly as an unusable key already is.
 *
 * Dropping rather than clamping is deliberate. `pageSize=99999` could be
 * pinned to 200 and `page=0` to 1, but both are guesses about what the caller
 * meant; falling back to the contract's own default is the one answer that
 * needs no guess.
 *
 * The loop matters because Zod reports every failing key at once but a schema
 * can reject a combination — removing one key can leave the rest valid, and
 * re-checking is how we keep the filters that were fine. It terminates because
 * each pass removes at least one key from a finite set, and returns as soon as
 * a pass removes none.
 */
function acceptable(raw: Record<string, string>, contract: QueryContract): Record<string, string> {
  let current = raw;

  for (;;) {
    const result = contract.safeParse(current);
    if (result.success) return current;

    const rejected = new Set<string>();
    for (const issue of result.error.issues) {
      const key = issue.path[0];
      // `in current` guards the other direction: an issue on a key we never
      // sent (a required field the console does not supply) is not ours to
      // drop, and pretending otherwise would spin here forever.
      if (typeof key === "string" && key in current) rejected.add(key);
    }
    if (rejected.size === 0) return current;

    const kept: Record<string, string> = {};
    for (const [key, value] of Object.entries(current)) {
      if (!rejected.has(key)) kept[key] = value;
    }
    current = kept;
  }
}

/**
 * Filters and pagination live in `searchParams`, so a filtered view is
 * shareable and the page stays server-rendered.
 *
 * Only the keys a module declares are forwarded. An unrecognised parameter is
 * dropped rather than passed through — the API validates its own query, but a
 * console that forwarded anything would let a crafted URL probe for parameters
 * the UI never offers.
 *
 * Given the module's query contract, an unusable VALUE is dropped the same way.
 * See `acceptable`.
 */
export function queryString(
  params: SearchParams,
  allowed: readonly string[],
  contract?: QueryContract,
): string {
  const collected: Record<string, string> = {};
  for (const key of allowed) {
    const value = params[key];
    // A repeated parameter (`?status=A&status=B`) arrives as an array. These
    // filters are single-valued, so take the first rather than joining them
    // into a string no filter would match.
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined && first !== "") collected[key] = first;
  }

  const query = new URLSearchParams(
    contract === undefined ? collected : acceptable(collected, contract),
  );
  const text = query.toString();
  return text === "" ? "" : `?${text}`;
}

/**
 * Fetches one page of a collection, parsed against the row contract.
 *
 * Parsing rather than casting is the point: a response that has drifted from
 * the contract fails here with the field named, instead of rendering as
 * `undefined` three components down.
 *
 * The query contract is REQUIRED rather than optional so that a new list
 * cannot be added without one. An optional guard is a guard half the modules
 * quietly do without.
 */
export async function fetchPage<TRow extends z.ZodTypeAny>(
  path: string,
  row: TRow,
  params: SearchParams,
  allowed: readonly string[],
  contract: QueryContract,
): Promise<Page<z.infer<TRow>>> {
  const response = await apiFetch(`${path}${queryString(params, allowed, contract)}`);
  return pageOf(row).parse(response) as Page<z.infer<TRow>>;
}

/** Every list endpoint accepts these on top of its own filters. */
export const PAGE_KEYS = ["page", "pageSize", "q", "sort", "order"] as const;
