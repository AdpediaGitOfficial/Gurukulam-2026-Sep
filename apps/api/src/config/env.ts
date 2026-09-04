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

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  · ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }

  const env = parsed.data;

  // A default secret in production is worse than a missing one, because it
  // starts successfully and mints forgeable tokens.
  if (env.NODE_ENV === "production") {
    for (const key of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"] as const) {
      if (/change-me/i.test(env[key])) {
        throw new Error(`${key} still holds its placeholder value in production.`);
      }
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

export const ENV = Symbol("ENV");
