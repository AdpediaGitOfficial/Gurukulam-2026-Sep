"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createAdminUserSchema,
  createRoleSchema,
  issuedAdminCredentialSchema,
  MODULES,
  roleSchema,
  updateAdminUserSchema,
  updateRoleSchema,
} from "@gurukulam/contracts";

import { apiFetch, checkShape } from "@/server/api";
import { apiFormError, fieldErrors, text } from "@/lib/action";
import { formError, type FormState } from "@/lib/form";
import type { AdminCredentialState } from "@/features/settings/types";

/**
 * The permission grid, as the form posts it.
 *
 * One checkbox per module and action, named `perm:<module>:<action>`. An
 * omitted module means no access — which is what the contract says and why
 * the matrix is a partial record rather than every module spelled out.
 */
function permissions(formData: FormData): Record<string, Record<string, boolean>> {
  const matrix: Record<string, Record<string, boolean>> = {};
  for (const module of MODULES) {
    const actions = (["read", "edit", "delete"] as const).filter(
      (action) => formData.get(`perm:${module}:${action}`) === "on",
    );
    if (actions.length === 0) continue;
    matrix[module] = {
      read: actions.includes("read"),
      edit: actions.includes("edit"),
      delete: actions.includes("delete"),
    };
  }
  return matrix;
}

/**
 * Creates or edits a role.
 *
 * The API refuses a role holding permissions the operator does not themselves
 * hold — assigning one you could not exercise is escalation by proxy — so the
 * refusal an operator sees here is that rule, not a form validation.
 */
export async function saveRole(
  roleId: string | undefined,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const editing = roleId !== undefined;
  const body = {
    name: text(formData, "name"),
    description: text(formData, "description"),
    permissions: permissions(formData),
  };

  const parsed = editing ? updateRoleSchema.safeParse(body) : createRoleSchema.safeParse(body);
  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  try {
    checkShape(
      roleSchema,
      await apiFetch(editing ? `/settings/roles/${roleId}` : "/settings/roles", {
        method: editing ? "PATCH" : "POST",
        body: parsed.data,
      }),
      editing ? "PATCH /settings/roles/:id" : "POST /settings/roles",
    );
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath("/settings/roles");
  redirect(`/settings/roles?${editing ? "saved" : "created"}=1`);
}

/**
 * Creates an administrator, and hands back their first password once.
 *
 * No redirect: the credential is on this page and a navigation would take it
 * with it. Nothing emails it — there is no mail integration — so the screen
 * says so before the operator can lose it.
 */
export async function createAdministrator(
  _previous: AdminCredentialState,
  formData: FormData,
): Promise<AdminCredentialState> {
  const parsed = createAdminUserSchema.safeParse({
    name: text(formData, "name"),
    email: text(formData, "email"),
    phone: text(formData, "phone"),
    roleId: text(formData, "roleId"),
    // An EMPTY list means global reach, which is why it is a deliberate choice
    // on the form rather than the default of ticking nothing.
    cityScope: formData.getAll("cityScope").map(String).filter(Boolean),
  });
  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  try {
    const issued = issuedAdminCredentialSchema.parse(
      await apiFetch("/settings/administrators", { method: "POST", body: parsed.data }),
    );
    revalidatePath("/settings/administrators");
    return { status: "idle", issued };
  } catch (error) {
    return apiFormError(error);
  }
}

/**
 * Edits an administrator.
 *
 * Role, region scope and account status are the privilege fields. Invariant 19
 * says an operator may not change their own, and the API refuses it — so the
 * form hides them on your own record rather than offering a control that
 * cannot work.
 */
export async function updateAdministrator(
  adminUserId: string,
  isSelf: boolean,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = updateAdminUserSchema.safeParse({
    name: text(formData, "name"),
    phone: text(formData, "phone"),
    ...(isSelf
      ? {}
      : {
          roleId: text(formData, "roleId"),
          cityScope: formData.getAll("cityScope").map(String).filter(Boolean),
          accountStatus: text(formData, "accountStatus"),
        }),
  });
  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  try {
    await apiFetch(`/settings/administrators/${adminUserId}`, {
      method: "PATCH",
      body: parsed.data,
    });
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath("/settings/administrators");
  redirect("/settings/administrators?saved=1");
}

/** Re-issues a password. The old one stops working the moment this returns. */
export async function resetAdministratorPassword(
  adminUserId: string,
  _previous: AdminCredentialState,
  _formData: FormData,
): Promise<AdminCredentialState> {
  try {
    const issued = issuedAdminCredentialSchema.parse(
      await apiFetch(`/settings/administrators/${adminUserId}/reset-password`, {
        method: "POST",
        body: {},
      }),
    );
    revalidatePath("/settings/administrators");
    return { status: "idle", issued };
  } catch (error) {
    return apiFormError(error);
  }
}
