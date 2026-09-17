import { z } from "zod";

/**
 * One error shape from every endpoint, so web and mobile render failures
 * identically instead of each guessing at the payload.
 *
 * `fields` is what a form binds to: keys are the request's own field paths, so
 * a client can attach a message to an input without mapping anything.
 */
export const apiErrorSchema = z.object({
  error: z.object({
    /** Machine-readable and stable. Clients branch on this, never on message. */
    code: z.string(),
    /** Human-readable, safe to show. Never contains internals. */
    message: z.string(),
    /** Field-keyed validation failures, e.g. { "email": "Already in use" }. */
    fields: z.record(z.string(), z.string()).optional(),
    /** Echoes the request id, so a user-reported failure is traceable. */
    requestId: z.string().optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

/**
 * Error codes. Adding one is an API change — clients branch on these, so a
 * rename breaks every consumer that handled it.
 */
export const ERROR_CODES = {
  VALIDATION_FAILED: "VALIDATION_FAILED",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
  ACCOUNT_INACTIVE: "ACCOUNT_INACTIVE",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  TOKEN_REUSED: "TOKEN_REUSED",
  FORBIDDEN: "FORBIDDEN",
  OUT_OF_SCOPE: "OUT_OF_SCOPE",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  INVARIANT_VIOLATION: "INVARIANT_VIOLATION",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL: "INTERNAL",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
