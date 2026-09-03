/**
 * Exercises the auth surface against a RUNNING api and a seeded database.
 *
 * These are the properties that are expensive to discover are missing later:
 * that scope reaches the principal, that a revoked permission takes effect
 * before the token expires, that a leaked refresh token kills its chain, and
 * that repeated failures lock the account.
 *
 *     pnpm --filter @gurukulam/api verify
 */
import { PrismaClient } from "@gurukulam/db";
import { clearRateLimit } from "./_rate-limit";

const BASE = process.env.API_URL ?? "http://127.0.0.1:4000/api/v1";
const PASSWORD = "Gurukulam@2026";

const prisma = new PrismaClient({ log: [] });

let passed = 0;
let failed = 0;

function ok(name: string, detail = "") {
  passed++;
  console.log(`  \x1b[32m✓\x1b[0m ${name}${detail ? `  \x1b[90m${detail}\x1b[0m` : ""}`);
}
function bad(name: string, detail: string) {
  failed++;
  console.log(`  \x1b[31m✗\x1b[0m ${name}\n      \x1b[31m${detail}\x1b[0m`);
}
const show = (v: unknown) => JSON.stringify(canonical(v));

/** Sorts object keys so a comparison does not depend on their order. */
function canonical(v: unknown): unknown {
  if (typeof v === "bigint") return `${v}n`;
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => [k, canonical(x)]),
    );
  }
  return v;
}

function expect(name: string, actual: unknown, wanted: unknown) {
  const a = JSON.stringify(actual);
  const w = JSON.stringify(wanted);
  if (a === w) ok(name, a === undefined ? "" : String(a));
  else bad(name, `expected ${w}, got ${a}`);
}

/**
 * Guards a response before its body is indexed into.
 *
 * Without this a bad response surfaces as "cannot read properties of
 * undefined" several lines later, which says nothing about what actually went
 * wrong. This reports the status and body at the point of failure.
 */
function assertOk<T>(name: string, res: Res<T>, wanted = 200): Res<T> {
  if (res.status !== wanted) {
    bad(name, `expected ${wanted}, got ${res.status}: ${show(res.body)}`);
    throw new Error(`${name}: ${res.status} ${show(res.body)}`);
  }
  ok(name, String(wanted));
  return res;
}

interface Res<T = any> { status: number; body: T }

async function call<T = any>(
  path: string,
  init: { method?: string; body?: unknown; token?: string } = {},
): Promise<Res<T>> {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const login = (email: string, password = PASSWORD, actor = "ADMIN_USER") =>
  call("/auth/login", { method: "POST", body: { email, password, actor, deviceLabel: "verify" } });

async function main() {
  // The suites share one address; the throttle is not aimed at them.
  await clearRateLimit();

  console.log("\n\x1b[1mHealth\x1b[0m");
  expect("liveness responds", (await call("/health")).body.status, "ok");
  expect("readiness reaches the database", (await call("/health/ready")).body.status, "ready");

  console.log("\n\x1b[1mAuthentication is opt-out, not opt-in\x1b[0m");
  const anon = await call("/auth/me");
  expect("an unauthenticated request is refused", anon.status, 401);
  expect("…with a stable error code", anon.body.error.code, "UNAUTHENTICATED");

  const garbage = await call("/auth/me", { token: "not.a.real.token" });
  expect("a malformed token is refused", garbage.status, 401);

  console.log("\n\x1b[1mValidation returns field-keyed errors\x1b[0m");
  const invalid = await call("/auth/login", { method: "POST", body: { email: "nope", password: "" } });
  expect("a bad payload is a 400", invalid.status, 400);
  expect("email carries its own message", invalid.body.error.fields.email, "Enter a valid email address");
  expect("password carries its own message", invalid.body.error.fields.password, "Enter your password");

  console.log("\n\x1b[1mLogin does not leak which accounts exist\x1b[0m");
  const wrongPassword = await login("priya@gurukulam.test", "definitely-wrong");
  const noSuchAccount = await login("nobody@nowhere.test", "definitely-wrong");
  expect("a wrong password is a 401", wrongPassword.status, 401);
  expect("an unknown account is also a 401", noSuchAccount.status, 401);
  expect(
    "…with an identical message",
    wrongPassword.body.error.message === noSuchAccount.body.error.message,
    true,
  );

  console.log("\n\x1b[1mScope reaches the principal (invariant 11)\x1b[0m");
  const superAdmin = await login("priya@gurukulam.test");
  expect("a super admin signs in", superAdmin.status, 200);
  expect("…and is globally scoped", superAdmin.body.principal.cityScope, null);
  expect("…with no college scope", superAdmin.body.principal.collegeScope, null);

  const regional = await login("arun@gurukulam.test");
  expect("a regional sub-admin signs in", regional.status, 200);
  const bengaluru = await prisma.city.findFirstOrThrow({ where: { cityCode: "CITY-BLR" } });
  expect("…and carries exactly their city", regional.body.principal.cityScope, [bengaluru.cityId]);
  expect("…which is NOT global", regional.body.principal.cityScope === null, false);

  const collegeUser = await login("tpo@snc.example.test", PASSWORD, "COLLEGE_USER");
  expect("a college user signs in", collegeUser.status, 200);
  const snc = await prisma.college.findFirstOrThrow({ where: { collegeCode: "CLG-SNC-01" } });
  expect("…scoped to their college", collegeUser.body.principal.collegeScope, snc.collegeId);
  expect("…and city-global, the same mechanism on another axis", collegeUser.body.principal.cityScope, null);

  const trainer = await login("kavitha@gurukulam.test", PASSWORD, "TRAINER");
  expect("a trainer signs in", trainer.status, 200);
  expect(
    "…but holds no console permissions while that portal is deferred",
    Object.keys(trainer.body.principal.permissions).length,
    0,
  );

  console.log("\n\x1b[1mPermissions are read live, not baked into the token\x1b[0m");
  const role = await prisma.role.findFirstOrThrow({ where: { name: "Regional Sub-Admin" } });
  const original = role.permissions;
  const before = await call("/auth/me", { token: regional.body.tokens.accessToken });
  expect("the sub-admin can read students", before.body.permissions.students.read, true);

  await prisma.role.update({
    where: { roleId: role.roleId },
    data: { permissions: { ...(original as object), students: { read: false, edit: false, delete: false } } },
  });
  const after = await call("/auth/me", { token: regional.body.tokens.accessToken });
  expect(
    "revoking it takes effect on the SAME token, not at expiry",
    after.body.permissions.students.read,
    false,
  );
  await prisma.role.update({ where: { roleId: role.roleId }, data: { permissions: original as object } });

  console.log("\n\x1b[1mRefresh tokens rotate\x1b[0m");
  const first = superAdmin.body.tokens.refreshToken;
  const rotated = await call("/auth/refresh", { method: "POST", body: { refreshToken: first } });
  expect("a refresh returns a new pair", rotated.status, 200);
  expect("…and the refresh token actually changed", rotated.body.tokens.refreshToken !== first, true);

  console.log("\n\x1b[1mA reused refresh token kills the chain\x1b[0m");
  // The legitimate holder has one token. Two uses means two holders.
  const replay = await call("/auth/refresh", { method: "POST", body: { refreshToken: first } });
  expect("replaying the rotated token is refused", replay.status, 401);
  expect("…as a reuse, not a generic failure", replay.body.error.code, "TOKEN_REUSED");

  const afterBreach = await call("/auth/refresh", {
    method: "POST",
    body: { refreshToken: rotated.body.tokens.refreshToken },
  });
  expect("…and the thief's newer token dies with it", afterBreach.status, 401);

  console.log("\n\x1b[1mLogout ends one session, not all of them\x1b[0m");
  const phone = await login("priya@gurukulam.test");
  const laptop = await login("priya@gurukulam.test");
  await call("/auth/logout", { method: "POST", body: { refreshToken: phone.body.tokens.refreshToken } });
  const laptopStillWorks = await call("/auth/refresh", {
    method: "POST",
    body: { refreshToken: laptop.body.tokens.refreshToken },
  });
  expect("signing out of one device leaves the other signed in", laptopStillWorks.status, 200);

  console.log("\n\x1b[1mLockout after repeated failures\x1b[0m");
  // Deliberately an address that does not exist, so a real account is not
  // locked by running this script.
  const probe = `lockout-probe-${Date.now()}@nowhere.test`;
  let lockedAt = 0;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await login(probe, "wrong");
    if (res.status === 429) { lockedAt = attempt; break; }
  }
  expect("the account locks on the fifth failure", lockedAt, 5);
  const locked = await login(probe, "wrong");
  expect("…and stays locked", locked.body.error.code, "ACCOUNT_LOCKED");

  console.log("\n\x1b[1mOpenAPI document\x1b[0m");
  const spec = (await (await fetch(`${BASE}/openapi.json`)).json()) as {
    openapi: string;
    paths: Record<string, unknown>;
    components: { schemas: Record<string, unknown> };
  };
  expect("the spec is served", spec.openapi, "3.1.0");
  expect("…and describes the auth surface", Object.keys(spec.paths).includes("/auth/login"), true);
  expect("…with schemas generated from the contracts", Object.keys(spec.components.schemas).includes("Session"), true);

  console.log(`\n${failed === 0 ? "\x1b[32m" : "\x1b[31m"}${passed} passed, ${failed} failed\x1b[0m\n`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
