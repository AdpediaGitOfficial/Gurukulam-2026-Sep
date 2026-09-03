import "server-only";

import {
  accountSchema,
  adminUserSchema,
  pageOf,
  roleSchema,
  type Account,
  type AdminUser,
  type Page,
  type Role,
} from "@gurukulam/contracts";

import { apiFetch } from "@/server/api";
import { queryString, PAGE_KEYS, type SearchParams } from "@/server/list";

/** Your own profile. Everything but the photo is set by a Super Admin (invariant 19). */
export async function getAccount(): Promise<Account> {
  return accountSchema.parse(await apiFetch("/account"));
}

export async function listRoles(params: SearchParams): Promise<Page<Role>> {
  const response = await apiFetch(`/settings/roles${queryString(params, PAGE_KEYS)}`);
  return pageOf(roleSchema).parse(response) as Page<Role>;
}

export async function listAdministrators(params: SearchParams): Promise<Page<AdminUser>> {
  const response = await apiFetch(`/settings/administrators${queryString(params, PAGE_KEYS)}`);
  return pageOf(adminUserSchema).parse(response) as Page<AdminUser>;
}
