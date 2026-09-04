"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { changePasswordSchema, loginSchema, sessionSchema } from "@gurukulam/contracts";

import { apiFetch, ApiRequestError } from "@/server/api";
import { clearSession, readRefreshToken, writeSession } from "@/server/session";
import { formError, type FormState } from "@/lib/form";

/**
 * Signs in and stores the token pair in httpOnly cookies.
 *
 * A Server Action, not a Route Handler, because it is the only kind of thing
 * that can both write a cookie and hand field-keyed errors back to the form
 * that submitted.
 */
export async function login(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    actor: formData.get("actor") ?? undefined,
    deviceLabel: "Admin console",
  });

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && fields[key] === undefined) fields[key] = issue.message;
    }
    return formError("Check the details below.", fields);
  }

  let session;
  try {
    session = sessionSchema.parse(
      await apiFetch("/auth/login", { method: "POST", body: parsed.data, anonymous: true }),
    );
  } catch (error) {
    if (error instanceof ApiRequestError) {
      // Wrong password and unknown address return the same code and the same
      // message, deliberately: distinguishing them turns the login form into a
      // way to enumerate who has an account here.
      return formError(error.message, Object.keys(error.fields).length > 0 ? error.fields : undefined);
    }
    return formError("Could not reach the server. Try again shortly.");
  }

  await writeSession(session.tokens);

  // `redirect` throws, so it must sit outside the try — caught, it would be
  // reported to the user as a failed login.
  redirect(session.mustResetPassword ? "/account/password?reason=first-login" : safeNext(formData));
}

export async function logout(): Promise<void> {
  const refreshToken = await readRefreshToken();

  // Clear locally first. If the API call fails the session is still gone from
  // this browser, which is the part the person in front of it cares about.
  await clearSession();

  if (refreshToken !== undefined) {
    try {
      await apiFetch("/auth/logout", { method: "POST", body: { refreshToken }, anonymous: true });
    } catch {
      // Already expired or revoked — nothing left to revoke.
    }
  }

  redirect("/login");
}

/**
 * Where to go after signing in. Only a bare same-origin path is honoured: a
 * `next` of `//evil.example` is protocol-relative, and browsers follow it off
 * this origin entirely.
 */
function safeNext(formData: FormData): string {
  const value = formData.get("next");
  if (typeof value !== "string") return "/dashboard";
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

/**
 * Changes your own password.
 *
 * The only credential field an operator may set for themselves. Everything else
 * — name, role, scope — is a Super Admin's to change, because letting someone
 * edit their own scope would make the permission model advisory.
 */
export async function changePassword(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      if (key !== "" && fields[key] === undefined) fields[key] = issue.message;
    }
    return formError("Check the details below.", fields);
  }

  try {
    await apiFetch("/auth/change-password", { method: "POST", body: parsed.data });
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return formError(
        error.message,
        Object.keys(error.fields).length > 0 ? error.fields : undefined,
      );
    }
    throw error;
  }

  revalidatePath("/account");
  redirect("/dashboard?password=changed");
}
