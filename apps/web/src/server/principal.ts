import "server-only";

import { redirect } from "next/navigation";
import { can, type Action, type ModuleName, type Principal } from "@gurukulam/contracts";

import { apiFetch } from "./api";

/**
 * The signed-in principal.
 *
 * Every console page starts here. An expired session never reaches this — the
 * fetch layer redirects to `/auth/refresh` first — so a caller can treat the
 * result as always present.
 *
 * Permissions and scope are decided by the API. This is a copy for rendering,
 * never the thing that grants access: a page that hid a button but still called
 * the endpoint would be exactly as authorised as one that showed it.
 */
export async function requirePrincipal(): Promise<Principal> {
  return apiFetch<Principal>("/auth/me");
}

/**
 * The principal, having checked they may read this module.
 *
 * The API enforces this too. Checking here as well is what turns a refusal into
 * a page that explains itself rather than an error the user has to interpret.
 */
export async function requireModule(
  module: ModuleName,
  action: Action = "read",
): Promise<Principal> {
  const principal = await requirePrincipal();
  if (!can(principal, module, action)) redirect("/no-access");
  return principal;
}
