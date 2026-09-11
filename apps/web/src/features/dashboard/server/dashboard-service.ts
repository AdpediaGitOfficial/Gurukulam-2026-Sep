import "server-only";

import { dashboardSchema, type Dashboard } from "@gurukulam/contracts";

import { apiFetch } from "@/server/api";

/**
 * The only thing in this feature that knows where the numbers come from.
 *
 * Components consume `Dashboard`; whether it arrives over HTTP, from a cache or
 * from a database is this file's business alone. Parsing rather than casting is
 * the point — a response that has drifted from the contract fails here, with
 * the field named, instead of rendering as `undefined` three components down.
 *
 * Scope is applied by the API, inside its own service (invariant 11). The
 * console never sends a scope filter — a client that could choose its own scope
 * would not be a scope.
 */
export async function getDashboard(): Promise<Dashboard> {
  return dashboardSchema.parse(await apiFetch("/dashboard"));
}
