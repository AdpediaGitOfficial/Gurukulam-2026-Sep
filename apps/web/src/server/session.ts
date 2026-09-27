import "server-only";

import { cookies } from "next/headers";
import type { TokenPair } from "@gurukulam/contracts";

/**
 * Session cookies.
 *
 * Both are httpOnly, so a script on the page cannot read a token even if one
 * gets injected. That is the whole reason the console proxies the API rather
 * than calling it from the browser: the alternative is a JWT in `localStorage`,
 * readable by anything that manages to run.
 */
const ACCESS_COOKIE = "gk_at";
const REFRESH_COOKIE = "gk_rt";

/**
 * The access cookie is given a shorter life than the token itself, so it
 * disappears from the browser slightly before the API would start rejecting
 * it. "No access cookie but a refresh cookie" is then an unambiguous signal to
 * refresh, and we never have to decode a JWT on this side to find out.
 */
const EXPIRY_SKEW_SECONDS = 30;

/** Matches JWT_REFRESH_TTL on the API. */
const REFRESH_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const base = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  // Set over TLS in production; a dev server on plain http would otherwise
  // silently drop every cookie.
  secure: process.env.NODE_ENV === "production",
} as const;

export async function readAccessToken(): Promise<string | undefined> {
  return (await cookies()).get(ACCESS_COOKIE)?.value;
}

export async function readRefreshToken(): Promise<string | undefined> {
  return (await cookies()).get(REFRESH_COOKIE)?.value;
}

/**
 * Only callable from a Server Action or a Route Handler — a Server Component
 * cannot write cookies, which is why refreshing happens at `/auth/refresh`
 * rather than inline in whichever page noticed the expiry.
 */
export async function writeSession(tokens: TokenPair): Promise<void> {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, tokens.accessToken, {
    ...base,
    maxAge: Math.max(1, tokens.expiresIn - EXPIRY_SKEW_SECONDS),
  });
  jar.set(REFRESH_COOKIE, tokens.refreshToken, {
    ...base,
    maxAge: REFRESH_MAX_AGE_SECONDS,
  });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}
