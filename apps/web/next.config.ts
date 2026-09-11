import type { NextConfig } from "next";

/**
 * Response headers for every page.
 *
 * This console holds a session in a cookie and can delete a student, revoke a
 * login, or move money on the record. That makes two of these load-bearing
 * rather than hygiene:
 *
 *   `frame-ancestors 'none'` — nothing may frame the console. Without it any
 *   page on the internet can put it in an invisible iframe, float a decoy
 *   button over a real one, and have a signed-in operator click it. The
 *   cookies are SameSite=Lax, which does not help here at all: the click is a
 *   top-level-ish navigation in the operator's own session.
 *
 *   `nosniff` — a browser must not decide that a response we labelled JSON is
 *   really HTML and run it.
 *
 * The CSP still allows inline script and style, and that is a knowing
 * compromise rather than an oversight: Next inlines its own bootstrap and
 * Tailwind injects style, so tightening it needs a nonce threaded through the
 * middleware. It is worth doing, and it is not what is standing between this
 * app and an attacker today — nothing here renders untrusted HTML, and the one
 * place user text meets markup (React) escapes it.
 *
 * What the policy DOES buy, even so: `default-src 'self'` means an injected
 * tag cannot load a script from another origin, `connect-src 'self'` means it
 * cannot exfiltrate to one, `form-action 'self'` means a planted form cannot
 * post credentials away, and `base-uri 'none'` means it cannot rewrite where
 * every relative URL on the page resolves to.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // Self-hosted by next/font at build time — no external font origin needed.
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Belt and braces for browsers that honour the older header; the CSP above
  // is what actually stops framing in anything current.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // A console URL carries record ids. Send the origin off-site, never the path.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing here uses any of them, so nothing here should be able to ask.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  // Two years, subdomains included. Only meaningful over TLS, which §6 of the
  // deployment runbook explains is not optional here anyway.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Do not let a browser or proxy keep a signed-in page for the next person.
  { key: "Cache-Control", value: "no-store" },
];

const config: NextConfig = {
  reactStrictMode: true,
  // The contracts package ships TypeScript source for the browser bundle.
  transpilePackages: ["@gurukulam/contracts"],
  eslint: { ignoreDuringBuilds: true },
  // Names the framework and its version to anyone who asks. Free reconnaissance.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
