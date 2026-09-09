import { z } from "zod";

/**
 * Environment is validated once, at boot, and the process refuses to start if
 * it is wrong. A missing JWT secret discovered at the first login attempt is a
 * production incident; discovered at boot it is a failed deploy.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().default(4000),
  API_BASE_PATH: z.string().default("/api/v1"),

  /**
   * The interface to bind. Loopback by DEFAULT, deliberately.
   *
   * The console is a BFF: the browser talks to it, and it talks to the API over
   * loopback. Nothing else needs to reach the API, so binding every interface
   * put an unauthenticated-by-default surface on the network for no benefit —
   * an operator who exposes it should have to say so.
   *
   * Set 0.0.0.0 only when a mobile or third-party client genuinely needs the
   * API directly, and then put it behind the proxy and set TRUST_PROXY.
   */
  API_HOST: z.string().default("127.0.0.1"),

  /**
   * Whose X-Forwarded-For to believe.
   *
   * `false` (the default) means: none. `req.ip` is then the socket peer, which
   * a client cannot forge.
   *
   * Anything else must NAME the proxy: one address or CIDR, or several
   * comma-separated — `127.0.0.1`, or `10.0.0.0/8,172.16.0.0/12`. Fastify then
   * walks X-Forwarded-For from the right and stops at the first hop that is not
   * on the list, so the entries a caller wrote themselves are discarded.
   *
   * A bare hop count is REFUSED, and the reason is worth knowing: fastify
   * 5.12.3 changed `trustProxy: <number>` to trust nobody, because a hop count
   * cannot check who the immediate peer actually is and a direct client can
   * simply supply enough hops. Accepting the number would leave an operator
   * believing they had configured something that now does nothing.
   *
   * `true` — trust everyone — is refused in production. It makes `req.ip`
   * whatever the caller says it is, which turns the per-caller rate limit into
   * a formality: rotate the header and every request gets a fresh bucket.
   */
  TRUST_PROXY: z.string().default("false"),

  /**
   * Serve the generated OpenAPI document and its Swagger page.
   *
   * They are registered on the raw Fastify instance and so bypass the auth
   * guard entirely — anyone who can reach the port can read them. Useful while
   * building, and an accurate map of the whole API surface otherwise, so it
   * defaults off in production.
   */
  API_DOCS_ENABLED: z.string().optional(),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET must be at least 16 characters"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET must be at least 16 characters"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),

  /** Optional. Without it, lockout falls back to an in-memory store. */
  REDIS_URL: z.string().optional(),

  CORS_ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),
  CRON_SHARED_SECRET: z.string().min(8).optional(),

  /** Login lockout: 5 failures inside 15 minutes locks the account for 30. */
  LOCKOUT_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  LOCKOUT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(900),
  LOCKOUT_DURATION_SECONDS: z.coerce.number().int().min(1).default(1800),
});

export type Env = Omit<z.infer<typeof envSchema>, "API_DOCS_ENABLED"> & {
  /** Resolved in `loadEnv`: unset means "on unless this is production". */
  API_DOCS_ENABLED: boolean;
};

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  · ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }

  const { API_DOCS_ENABLED: docsFlag, ...rest } = parsed.data;
  const env: Env = {
    ...rest,
    API_DOCS_ENABLED:
      docsFlag === undefined
        ? rest.NODE_ENV !== "production"
        : /^(1|true|yes)$/i.test(docsFlag.trim()),
  };

  // A default secret in production is worse than a missing one, because it
  // starts successfully and mints forgeable tokens.
  if (env.NODE_ENV === "production") {
    for (const key of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"] as const) {
      if (/change-me/i.test(env[key])) {
        throw new Error(`${key} still holds its placeholder value in production.`);
      }
    }
    if (/^\d+$/.test(env.TRUST_PROXY.trim())) {
      throw new Error(
        "TRUST_PROXY is a hop count, and a hop count no longer trusts anything: fastify " +
          "5.12.3 made `trustProxy: <number>` fail closed, because it cannot verify the " +
          "immediate peer. Name the proxy's address instead, e.g. TRUST_PROXY=127.0.0.1.",
      );
    }
    if (/^true$/i.test(env.TRUST_PROXY)) {
      throw new Error(
        "TRUST_PROXY=true trusts an X-Forwarded-For header from anybody, so the client " +
          "address becomes whatever the caller claims and per-caller rate limiting stops " +
          "working. Name the proxy instead — a hop count (1) or its address (127.0.0.1).",
      );
    }
    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      throw new Error(
        "JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ — sharing them lets a " +
          "refresh token be presented as an access token.",
      );
    }
  }

  return env;
}

/**
 * `TRUST_PROXY` in the shape Fastify wants.
 *
 * A list of addresses makes Fastify walk X-Forwarded-For from the right and
 * stop at the first hop it does not recognise, discarding the entries a caller
 * could have written — which is the whole point. A bare number is not a hop
 * count any more (see TRUST_PROXY above) and never reaches here in production.
 */
export function trustProxyOption(value: string): boolean | string[] {
  const trimmed = value.trim();
  if (trimmed === "" || /^false$/i.test(trimmed)) return false;
  if (/^true$/i.test(trimmed)) return true;
  // A bare number is rejected in loadEnv; outside production, fall closed
  // rather than hand fastify an option that silently does nothing.
  if (/^\d+$/.test(trimmed)) return false;
  return trimmed.split(",").map((entry) => entry.trim()).filter(Boolean);
}

export const ENV = Symbol("ENV");
