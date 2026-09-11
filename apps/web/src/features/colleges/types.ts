import type { IssuedCredential } from "@gurukulam/contracts";
import type { FormState } from "@/lib/form";

/**
 * What granting portal access returns.
 *
 * The credential is the POINT of the action, not a side effect, so it comes
 * back in the action's own state rather than through a redirect. It is never
 * put in a URL: a query string lands in browser history, the proxy's access
 * log and any `Referer` sent onward, and a password that reaches all three has
 * effectively been published.
 *
 * The API returns it exactly once and stores only its hash, so nothing here
 * can re-read it later. Navigating away loses it, which is why the panel says
 * so before the operator can.
 */
export interface GrantState extends FormState {
  issued?: IssuedCredential;
}
