import type { IssuedAdminCredential } from "@gurukulam/contracts";
import type { FormState } from "@/lib/form";

/**
 * What creating an administrator — or resetting their password — returns.
 *
 * The credential is the point of the action, so it comes back in the action's
 * own state rather than through a redirect. Never in a URL: a query string
 * lands in browser history, the proxy's access log and any onward `Referer`.
 *
 * The API returns it once and keeps only its hash, so this is the only copy
 * that will ever exist. Same shape as college portal access, deliberately.
 */
export interface AdminCredentialState extends FormState {
  issued?: IssuedAdminCredential;
}
