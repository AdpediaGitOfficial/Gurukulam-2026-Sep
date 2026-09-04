import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { sessionSchema } from "@gurukulam/contracts";

import { apiFetch } from "@/server/api";
import { clearSession, readRefreshToken, writeSession } from "@/server/session";

/**
 * Trades a refresh token for a new pair, then returns the user where they were.
 *
 * This exists as a route rather than as logic inside `apiFetch` because only a
 * Route Handler or a Server Action may set a cookie — a Server Component that
 * refreshed inline would get new tokens and have nowhere to put them.
 *
 * Funnelling every expiry through one request also keeps refresh serial. The
 * API rotates refresh tokens and treats a reused one as theft, so two parallel
 * refreshes would revoke the session outright; a redirect is one request.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const next = safeNext(request.nextUrl.searchParams.get("next"));

  const refreshToken = await readRefreshToken();
  if (refreshToken === undefined) redirect(`/login?next=${encodeURIComponent(next)}`);

  let mustResetPassword = false;

  try {
    // The full session, not just the pair: refreshing re-reads the account, so
    // a password reset imposed since sign-in takes effect at the next renewal
    // rather than at the next sign-in.
    const session = sessionSchema.parse(
      await apiFetch("/auth/refresh", {
        method: "POST",
        body: { refreshToken },
        anonymous: true,
      }),
    );
    await writeSession(session.tokens);
    mustResetPassword = session.mustResetPassword;
  } catch {
    // Expired, revoked, or already used. Either way there is no session left
    // to save, and holding on to a dead cookie only repeats this round trip.
    await clearSession();
    redirect(`/login?next=${encodeURIComponent(next)}&reason=expired`);
  }

  // Outside the try: `redirect` works by throwing, and caught here it would be
  // read as a failed refresh and end the session it just renewed.
  redirect(mustResetPassword ? "/account/password?reason=required" : next);
}

/**
 * `next` comes from the URL, so it is attacker-controllable. Only a bare
 * same-origin path is honoured — `//evil.example` is a valid URL that browsers
 * treat as protocol-relative, which is how a redirector becomes a phishing page.
 */
function safeNext(value: string | null): string {
  if (value === null) return "/dashboard";
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}
