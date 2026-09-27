import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { LoginForm } from "@/features/auth/components/login-form";
import { apiFetch } from "@/server/api";
import { readAccessToken } from "@/server/session";

export const metadata: Metadata = { title: "Sign in" };

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = safePath(params["next"]);

  // Already signed in — send them on rather than showing a form that would
  // replace a working session with the same one.
  if (await hasLiveSession()) redirect(next);

  return (
    <Card className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1 text-ink">Sign in</h1>
        <p className="text-body-sm text-ink-muted">
          Use the address issued to you by your administrator.
        </p>
      </div>

      {params["reason"] === "expired" ? (
        <Alert intent="info" title="Your session ended">
          Sign in again to pick up where you left off.
        </Alert>
      ) : null}

      <LoginForm next={next} />
    </Card>
  );
}

/**
 * Whether the cookie we hold is still accepted — not merely present. A token
 * revoked on the API is indistinguishable from a live one until it is used.
 *
 * `onExpired: "throw"` because this is the one caller asking *whether* there is
 * a session. Left on the default the fetch layer would redirect an expired one
 * to safety, and safety from here is this page.
 */
async function hasLiveSession(): Promise<boolean> {
  if ((await readAccessToken()) === undefined) return false;
  try {
    await apiFetch("/auth/me", { onExpired: "throw" });
    return true;
  } catch {
    return false;
  }
}

/** Same-origin paths only — see the note in `/auth/refresh`. */
function safePath(value: string | string[] | undefined): string {
  if (typeof value !== "string") return "/dashboard";
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}
