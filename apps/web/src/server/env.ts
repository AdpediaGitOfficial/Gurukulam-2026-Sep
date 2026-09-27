import "server-only";

/**
 * The console is a BFF. Tokens live in httpOnly cookies that the browser can
 * carry but not read, and every API call is made from the server — so this URL
 * is an internal address and is deliberately not `NEXT_PUBLIC_`.
 */
const url = process.env["API_INTERNAL_URL"];

if (url === undefined || url === "") {
  throw new Error(
    "API_INTERNAL_URL is not set. Copy apps/web/.env.example to apps/web/.env.",
  );
}

/** Base URL of the API, without a trailing slash. */
export const API_INTERNAL_URL = url.replace(/\/+$/, "");
