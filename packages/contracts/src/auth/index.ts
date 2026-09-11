import { z } from "zod";
import { principalSchema } from "../common/principal.js";

/**
 * Auth is shared by three client kinds, so the contract has to serve all of
 * them from one set of endpoints:
 *
 *   · the Next.js console, which acts as a BFF — it holds the tokens in
 *     httpOnly cookies and the browser never sees a JWT;
 *   · native mobile apps, which hold the bearer tokens themselves;
 *   · third-party consumers, which use scoped API keys instead of these.
 */

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
  /**
   * Which login surface this is. The same address can exist as an admin and
   * as a college user, so the actor kind is part of the credential.
   */
  actor: z.enum(["ADMIN_USER", "COLLEGE_USER", "TRAINER", "STUDENT"]).default("ADMIN_USER"),
  /** Shown in the session list so a user can revoke a device they recognise. */
  deviceLabel: z.string().max(160).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RefreshInput = z.infer<typeof refreshSchema>;

export const tokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Seconds until the access token expires. */
  expiresIn: z.number().int(),
  tokenType: z.literal("Bearer"),
});

export type TokenPair = z.infer<typeof tokenPairSchema>;

export const sessionSchema = z.object({
  tokens: tokenPairSchema,
  principal: principalSchema,
  /** True when the account must set a new password before doing anything. */
  mustResetPassword: z.boolean(),
});

export type Session = z.infer<typeof sessionSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z
      .string()
      .min(12, "Use at least 12 characters")
      .max(200)
      .regex(/[a-z]/, "Include a lowercase letter")
      .regex(/[A-Z]/, "Include an uppercase letter")
      .regex(/\d/, "Include a digit"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: "Choose a password you have not used here before",
    path: ["newPassword"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
