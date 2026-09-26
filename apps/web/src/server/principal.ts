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

/**
 * The signed-in student.
 *
 * ── Why the actor is checked and not a permission ───────────────────────
 *
 * A student principal carries no permissions at all — that is what keeps them
 * out of the admin console, and it fails closed. So there is no `can(...)` that
 * can express "is this the portal's audience"; the question is who is asking.
 *
 * The API gates the same way, on every `/me/*` route. This copy exists so an
 * administrator who follows a portal link gets sent back to their own console
 * instead of a 403 rendered as a broken page.
 */
export async function requireStudent(): Promise<Principal> {
  const principal = await requirePrincipal();
  if (principal.actor !== "STUDENT") redirect("/dashboard");
  return principal;
}

/**
 * The same, for the trainer portal.
 *
 * A student who followed a trainer link is sent to their own portal rather
 * than to a console they cannot read — sending everybody to `/dashboard` would
 * bounce them between two screens that both refuse them.
 */
export async function requireTrainer(): Promise<Principal> {
  const principal = await requirePrincipal();
  if (principal.actor === "TRAINER") return principal;
  redirect(principal.actor === "STUDENT" ? "/portal" : "/dashboard");
}
