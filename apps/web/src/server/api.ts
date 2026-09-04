import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { apiErrorSchema, type ApiError } from "@gurukulam/contracts";

import { API_INTERNAL_URL } from "./env";
import { readAccessToken, readRefreshToken } from "./session";

/**
 * A failure the API described in its own error envelope.
 *
 * `fields` is keyed by the request's field paths, so a form binds to it
 * directly — the console never maps API errors onto its own shape, because a
 * mapping is one more place for the two to drift apart.
 */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;
  readonly requestId: string | undefined;

  constructor(status: number, error: ApiError["error"]) {
    super(error.message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = error.code;
    this.fields = error.fields ?? {};
    this.requestId = error.requestId;
  }
}

/**
 * The access token is gone or no longer accepted.
 *
 * Only reaches a caller that asked for it with `onExpired: "throw"`. By default
 * an expiry is recovered here instead — see `recoverSession`.
 */
export class SessionExpiredError extends Error {
  constructor() {
    super("Session expired");
    this.name = "SessionExpiredError";
  }
}

/**
 * Sends an expired session somewhere it can be renewed.
 *
 * This has to happen inside `apiFetch` rather than in the layout that resolves
 * the principal, because a layout and the page beneath it render in parallel:
 * the layout redirecting does not stop the page from calling the API with the
 * same dead token, and that second failure surfaces as an unhandled error even
 * though the response was a correct redirect.
 *
 * A Server Component may not set a cookie, so it cannot refresh — but it may
 * redirect, and `/auth/refresh` can do both.
 */
async function recoverSession(): Promise<never> {
  const target = await currentPath();
  const refresh = await readRefreshToken();
  redirect(
    refresh === undefined
      ? `/login?next=${encodeURIComponent(target)}`
      : `/auth/refresh?next=${encodeURIComponent(target)}`,
  );
}

/**
 * The path being rendered, so a sign-in returns the user to it. Recorded by the
 * middleware — `next/headers` exposes request headers but not the URL.
 */
async function currentPath(): Promise<string> {
  const value = (await headers()).get("x-pathname");
  // Only ever a same-origin path. Anything else is an open redirect waiting to
  // happen, even though this one is set by our own middleware.
  return value !== null && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export interface ApiRequest {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** Serialised as JSON. Query strings belong in the path. */
  body?: unknown;
  /**
   * Omit the session token. Only login and refresh want this — everything else
   * should fail as unauthenticated rather than quietly run as nobody.
   */
  anonymous?: boolean;
  /**
   * Seconds to cache the response. Left off, nothing is cached: this is an
   * operations console where a stale roster is worse than a slow one.
   */
  revalidate?: number;
  /**
   * What to do when the session has expired. The default redirects, which is
   * what every page and action wants. `"throw"` is for the one caller that is
   * asking *whether* there is a session — the login page — where redirecting
   * would send it back to itself.
   */
  onExpired?: "redirect" | "throw";
}

/**
 * The one place the console talks to the API.
 *
 * Everything above this is typed against `@gurukulam/contracts`, so a field
 * that changes in the contract fails to compile here and in the API in the
 * same commit.
 */
export async function apiFetch<T>(path: string, request: ApiRequest = {}): Promise<T> {
  const { method = "GET", body, anonymous = false, revalidate, onExpired = "redirect" } = request;

  const expired = async (): Promise<never> => {
    if (onExpired === "redirect") await recoverSession();
    throw new SessionExpiredError();
  };

  const requestHeaders: Record<string, string> = { accept: "application/json" };
  if (body !== undefined) requestHeaders["content-type"] = "application/json";

  if (!anonymous) {
    const token = await readAccessToken();
    if (token === undefined) await expired();
    requestHeaders["authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_INTERNAL_URL}${path}`, {
    method,
    headers: requestHeaders,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(revalidate === undefined ? { cache: "no-store" } : { next: { revalidate } }),
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();

  if (!response.ok) {
    // A 401 from an authenticated call means the token we sent is no longer
    // good, whatever the endpoint was.
    if (response.status === 401 && !anonymous) await expired();
    throw new ApiRequestError(response.status, readError(text, response.status));
  }

  return (text === "" ? undefined : JSON.parse(text)) as T;
}

/**
 * Reads the error envelope, falling back to a synthetic one.
 *
 * A gateway or a crash can return HTML where the contract promises JSON. Parsed
 * blindly that surfaces as "Unexpected token <", which tells a user nothing and
 * sends whoever debugs it looking in the wrong place.
 */
function readError(text: string, status: number): ApiError["error"] {
  try {
    const parsed = apiErrorSchema.safeParse(JSON.parse(text));
    if (parsed.success) return parsed.data.error;
  } catch {
    // Fall through to the synthetic error below.
  }

  return {
    code: status >= 500 ? "INTERNAL" : "VALIDATION_FAILED",
    message:
      status >= 500
        ? "The server could not complete that request. Try again shortly."
        : "That request could not be completed.",
  };
}

/**
 * Checks a response against its contract without letting a mismatch undo the
 * outcome.
 *
 * For a mutation whose body we do not consume, the HTTP status IS the outcome:
 * the write has already landed. Parsing the body and throwing on a mismatch
 * turns a successful write into a reported failure — the operator retries and
 * hits "that has already happened", which is far worse than the drift itself.
 * That is not hypothetical: confirming a requirement created its batch and then
 * reported an error, because the endpoint returns the requirement and the
 * action was parsing a batch.
 *
 * So the shape is still checked, because a drifted response is a real bug, but
 * it is reported where an engineer will see it rather than where an operator
 * will.
 */
export function checkShape(
  schema: { safeParse: (value: unknown) => { success: boolean } },
  value: unknown,
  label: string,
): void {
  if (!schema.safeParse(value).success) {
    console.warn(
      `[contract] ${label} returned a body that does not match its schema. ` +
        "The write succeeded; the response shape has drifted.",
    );
  }
}
