/**
 * The controls that only matter when someone is attacking.
 *
 * Every check here is a thing that was, or could quietly become, wrong — and
 * each is written as the attack rather than as an assertion about the code, so
 * it keeps testing the behaviour after a refactor moves the code.
 *
 * The one that motivated the suite: the per-caller rate limit that guards login
 * was fully bypassable. `trustProxy: true` made `req.ip` whatever the caller
 * put in X-Forwarded-For, so rotating the header gave every request a fresh
 * bucket — 40 of 40 attempts landed where 30 was the limit.
 *
 *     npm run verify:security --workspace @gurukulam/api
 */
import { clearRateLimit } from "./_rate-limit";

const BASE = process.env.API_URL ?? "http://127.0.0.1:4000/api/v1";
const WEB = process.env.WEB_URL ?? "http://127.0.0.1:3100";
const PASSWORD = "Gurukulam@2026";

let passed = 0;
let failed = 0;
const ok = (n: string, d = "") =>
  (passed++, console.log(`  \x1b[32m✓\x1b[0m ${n}${d ? `  \x1b[90m${d}\x1b[0m` : ""}`));
const bad = (n: string, d: string) =>
  (failed++, console.log(`  \x1b[31m✗\x1b[0m ${n}\n      \x1b[31m${d}\x1b[0m`));

const login = (body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

async function main() {
  console.log("\n  Security controls\n");

  // ── 1. The rate limit cannot be stepped over with a header ───────────────
  //
  // Unique email per attempt, so the per-ACCOUNT lockout never fires and the
  // only thing that can refuse these is the per-caller limit.
  await clearRateLimit();
  const stamp = Date.now();
  let through = 0;
  for (let i = 0; i < 40; i += 1) {
    const response = await login(
      { email: `spoof-${stamp}-${i}@example.invalid`, password: "wrong", actor: "ADMIN_USER" },
      { "x-forwarded-for": `203.0.113.${i + 1}` },
    );
    if (response.status !== 429) through += 1;
  }
  through <= 31
    ? ok("a rotating X-Forwarded-For does not buy a fresh rate-limit bucket", `${through} of 40 got through`)
    : bad(
        "a rotating X-Forwarded-For does not buy a fresh rate-limit bucket",
        `${through} of 40 got through — the limit is 30, so the header is being believed`,
      );

  // The header should not reach the audit trail either: an IP written into a
  // session record by the person being recorded is worse than no IP at all.
  await clearRateLimit();

  // ── 2. The account lockout still works ───────────────────────────────────
  const victim = `lockout-${stamp}@example.invalid`;
  let locked = false;
  for (let i = 0; i < 8; i += 1) {
    const response = await login({ email: victim, password: "wrong", actor: "ADMIN_USER" });
    const body = (await response.json()) as { error?: { code?: string } };
    if (body.error?.code === "ACCOUNT_LOCKED") locked = true;
  }
  locked
    ? ok("repeated guesses against one account lock it")
    : bad("repeated guesses against one account lock it", "eight wrong passwords never tripped it");

  // And rotating the header must not reset it — lockout keys on the account.
  const stillLocked = await login(
    { email: victim, password: "wrong", actor: "ADMIN_USER" },
    { "x-forwarded-for": "198.51.100.77" },
  );
  const lockedBody = (await stillLocked.json()) as { error?: { code?: string } };
  lockedBody.error?.code === "ACCOUNT_LOCKED"
    ? ok("and a new address does not lift the lock")
    : bad("and a new address does not lift the lock", JSON.stringify(lockedBody));

  await clearRateLimit();

  // ── 3. Login does not say which addresses exist ──────────────────────────
  const unknown = await login({
    email: `nobody-${stamp}@example.invalid`, password: "wrong", actor: "ADMIN_USER",
  });
  const known = await login({ email: "priya@gurukulam.test", password: "wrong", actor: "ADMIN_USER" });
  const unknownBody = (await unknown.json()) as { error?: { code?: string; message?: string } };
  const knownBody = (await known.json()) as { error?: { code?: string; message?: string } };
  unknown.status === known.status &&
  unknownBody.error?.code === knownBody.error?.code &&
  unknownBody.error?.message === knownBody.error?.message
    ? ok("a wrong password reads the same for a real and an invented account")
    : bad(
        "a wrong password reads the same for a real and an invented account",
        `${unknown.status} ${JSON.stringify(unknownBody)} vs ${known.status} ${JSON.stringify(knownBody)}`,
      );

  await clearRateLimit();

  // ── 4. Nothing is readable without a token ───────────────────────────────
  const closed = ["/students", "/colleges", "/trainers", "/batches", "/fee-ledger", "/auth/me"];
  const leaks: string[] = [];
  for (const path of closed) {
    const response = await fetch(`${BASE}${path}`);
    if (response.status !== 401) leaks.push(`${path} → ${response.status}`);
  }
  leaks.length === 0
    ? ok("every data endpoint refuses an anonymous read", `${closed.length} checked`)
    : bad("every data endpoint refuses an anonymous read", leaks.join(", "));

  // A structurally valid but unsigned token must not be accepted either.
  const forged = [
    Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify({ sub: "any", actor: "ADMIN_USER" })).toString("base64url"),
    "",
  ].join(".");
  const forgedResponse = await fetch(`${BASE}/auth/me`, {
    headers: { authorization: `Bearer ${forged}` },
  });
  forgedResponse.status === 401
    ? ok("an alg:none token is refused")
    : bad("an alg:none token is refused", `${forgedResponse.status}`);

  // ── 5. Errors do not describe the machine ────────────────────────────────
  const broken = await fetch(`${BASE}/students/../../etc/passwd`);
  const brokenText = await broken.text();
  /prisma|stack|at .*\.ts:|node_modules|postgres/i.test(brokenText)
    ? bad("an error does not leak internals", brokenText.slice(0, 160))
    : ok("an error does not leak internals", `${broken.status}`);

  // ── 6. Response headers ──────────────────────────────────────────────────
  const health = await fetch(`${BASE}/health`);
  health.headers.get("x-content-type-options") === "nosniff"
    ? ok("API sends nosniff")
    : bad("API sends nosniff", String(health.headers.get("x-content-type-options")));
  (health.headers.get("content-security-policy") ?? "").includes("frame-ancestors 'none'")
    ? ok("API forbids being framed")
    : bad("API forbids being framed", String(health.headers.get("content-security-policy")));
  (health.headers.get("cache-control") ?? "").includes("no-store")
    ? ok("API responses are not cacheable")
    : bad("API responses are not cacheable", String(health.headers.get("cache-control")));

  // ── 7. The console's headers, and its open-redirect guard ────────────────
  try {
    const page = await fetch(`${WEB}/login`, { redirect: "manual" });
    const csp = page.headers.get("content-security-policy") ?? "";
    csp.includes("frame-ancestors 'none'")
      ? ok("console forbids being framed", "clickjacking on a session-cookie console")
      : bad("console forbids being framed", csp || "(no CSP)");
    page.headers.get("x-content-type-options") === "nosniff"
      ? ok("console sends nosniff")
      : bad("console sends nosniff", String(page.headers.get("x-content-type-options")));
    page.headers.get("x-powered-by") === null
      ? ok("console does not name its framework")
      : bad("console does not name its framework", String(page.headers.get("x-powered-by")));

    // Every one of these resolves off-origin in a browser.
    const hostile = [
      "//evil.example",
      "/\\evil.example",
      "/\\/evil.example",
      "https://evil.example",
      "/%09/evil.example",
      "/%0a/evil.example",
    ];
    const escaped: string[] = [];
    for (const next of hostile) {
      const response = await fetch(
        `${WEB}/auth/refresh?next=${encodeURIComponent(next)}`,
        { redirect: "manual" },
      );
      const location = response.headers.get("location") ?? "";
      // With no session the route bounces to /login carrying `next`; what
      // matters is that the value it carries is not the hostile one.
      if (location.includes("evil.example")) escaped.push(`${next} → ${location}`);
    }
    escaped.length === 0
      ? ok("no redirect target escapes the origin", `${hostile.length} payloads`)
      : bad("no redirect target escapes the origin", escaped.join(" | "));
  } catch (error) {
    bad("console checks", `console not reachable at ${WEB}: ${String(error).slice(0, 120)}`);
  }

  // ── 8. A real session still works ────────────────────────────────────────
  await clearRateLimit();
  const good = await login({ email: "priya@gurukulam.test", password: PASSWORD, actor: "ADMIN_USER" });
  const session = (await good.json()) as { tokens?: { accessToken: string } };
  if (session.tokens) {
    const me = await fetch(`${BASE}/auth/me`, {
      headers: { authorization: `Bearer ${session.tokens.accessToken}` },
    });
    me.status === 200
      ? ok("none of this broke signing in")
      : bad("none of this broke signing in", `/auth/me → ${me.status}`);
  } else {
    bad("none of this broke signing in", JSON.stringify(session).slice(0, 160));
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
