import { z } from "zod";
import {
  apiErrorSchema,
  changePasswordSchema,
  loginSchema,
  principalSchema,
  refreshSchema,
  sessionSchema,
} from "@gurukulam/contracts";

/**
 * The OpenAPI document, generated FROM the Zod contracts rather than written
 * beside them.
 *
 * This matters more here than in a single-consumer design: mobile and
 * third-party teams build against this document, and a hand-maintained spec
 * drifts from the validation silently — the API keeps rejecting a payload the
 * document says is valid.
 */
const components: Record<string, unknown> = {};

function register(name: string, schema: z.ZodType): { $ref: string } {
  components[name] = z.toJSONSchema(schema, { io: "output", target: "draft-2020-12" });
  return { $ref: `#/components/schemas/${name}` };
}

const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } },
});

export function buildOpenApiDocument(basePath: string): Record<string, unknown> {
  const ApiError = register("ApiError", apiErrorSchema);
  const Login = register("LoginInput", loginSchema);
  const Refresh = register("RefreshInput", refreshSchema);
  const Session = register("Session", sessionSchema);
  const Principal = register("Principal", principalSchema);
  const ChangePassword = register("ChangePasswordInput", changePasswordSchema);

  const json = (schema: { $ref: string }) => ({ "application/json": { schema } });

  return {
    openapi: "3.1.0",
    info: {
      title: "Gurukulam TMS API",
      version: "1.0.0",
      description:
        "Training management for retail and B2B college segments. Every consumer — the admin " +
        "console, mobile clients and third-party integrations — uses these endpoints; there is " +
        "no privileged internal path.\n\n" +
        "**Money** is always an integer count of minor units (paise) sent as a decimal string. " +
        "Parse it as a big integer, never as a float.",
    },
    servers: [{ url: basePath }],
    tags: [{ name: "Auth" }, { name: "Health" }],
    components: {
      schemas: components,
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      "/health": {
        get: {
          tags: ["Health"], summary: "Liveness", security: [],
          responses: { "200": { description: "The process is up" } },
        },
      },
      "/health/ready": {
        get: {
          tags: ["Health"], summary: "Readiness — checks the database", security: [],
          responses: { "200": { description: "Ready to serve traffic" }, "500": errorResponse("Not ready") },
        },
      },
      "/auth/login": {
        post: {
          tags: ["Auth"], summary: "Exchange credentials for a token pair", security: [],
          description:
            "Five failures inside fifteen minutes locks the account for thirty. The response is " +
            "identical whether the address is unknown or the password is wrong.",
          requestBody: { required: true, content: json(Login) },
          responses: {
            "200": { description: "Signed in", content: json(Session) },
            "400": errorResponse("Validation failed"),
            "401": errorResponse("Invalid credentials"),
            "403": errorResponse("Account not active"),
            "429": errorResponse("Locked after repeated failures"),
          },
        },
      },
      "/auth/refresh": {
        post: {
          tags: ["Auth"], summary: "Rotate a refresh token", security: [],
          description:
            "The presented token is revoked and a replacement issued. Presenting an " +
            "already-rotated token means a copy leaked, so every session for that actor is revoked.",
          requestBody: { required: true, content: json(Refresh) },
          responses: {
            "200": { description: "Rotated", content: json(Session) },
            "401": errorResponse("Expired, unknown or reused"),
          },
        },
      },
      "/auth/logout": {
        post: {
          tags: ["Auth"], summary: "End one session", security: [],
          requestBody: { required: true, content: json(Refresh) },
          responses: { "204": { description: "Ended" } },
        },
      },
      "/auth/me": {
        get: {
          tags: ["Auth"], summary: "The current principal, with live permissions and scope",
          description:
            "Rebuilt from the database on every request, so a revoked permission or narrowed " +
            "city scope takes effect immediately rather than at token expiry.",
          responses: {
            "200": { description: "The caller", content: json(Principal) },
            "401": errorResponse("Not signed in"),
          },
        },
      },
      "/auth/change-password": {
        post: {
          tags: ["Auth"], summary: "Change your own password",
          description: "Revokes every other session for the account.",
          requestBody: { required: true, content: json(ChangePassword) },
          responses: {
            "204": { description: "Changed" },
            "400": errorResponse("Validation failed"),
          },
        },
      },
    },
  };
}

/** Swagger UI, loaded from a CDN so the API ships no static assets. */
export const docsPage = (specUrl: string): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gurukulam TMS API</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.18.2/swagger-ui.min.css">
</head>
<body>
<div id="ui"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.18.2/swagger-ui-bundle.min.js"></script>
<script>
  window.ui = SwaggerUIBundle({ url: ${JSON.stringify(specUrl)}, dom_id: "#ui", deepLinking: true });
</script>
</body>
</html>`;
