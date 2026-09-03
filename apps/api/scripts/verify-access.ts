/**
 * M1's management half — roles, administrators and the account screen.
 *
 * This is the module that can lock an organisation out of its own system, or
 * quietly hand someone the keys. Almost every assertion here is about what an
 * operator may NOT do:
 *
 *   · nobody grants permissions or scope beyond their own;
 *   · nobody edits their own role, scope or status (invariant 19);
 *   · the last Super Admin cannot be removed or demoted.
 *
 *     pnpm --filter @gurukulam/api verify:access
 */
import { PrismaClient } from "@gurukulam/db";

const BASE = process.env.API_URL ?? "http://127.0.0.1:4000/api/v1";
const PASSWORD = "Gurukulam@2026";
const prisma = new PrismaClient({ log: [] });

let passed = 0, failed = 0;
const ok = (n: string, d = "") => { passed++; console.log(`  \x1b[32m✓\x1b[0m ${n}${d ? `  \x1b[90m${d}\x1b[0m` : ""}`); };
const bad = (n: string, d: string) => { failed++; console.log(`  \x1b[31m✗\x1b[0m ${n}\n      \x1b[31m${d}\x1b[0m`); };
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
  const a = show(actual), w = show(wanted);
  if (a === w) ok(name, String(a)); else bad(name, `expected ${w}, got ${a}`);
}

interface Res<T = any> { status: number; body: T }
function assertOk<T>(name: string, res: Res<T>, wanted = 200): Res<T> {
  if (res.status !== wanted) {
    bad(name, `expected ${wanted}, got ${res.status}: ${show(res.body)}`);
    throw new Error(`${name}: ${res.status}`);
  }
  ok(name, String(wanted));
  return res;
}
async function call<T = any>(path: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<Res<T>> {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
async function tokenFor(email: string, password = PASSWORD): Promise<string> {
  const r = await call("/auth/login", { method: "POST", body: { email, password, actor: "ADMIN_USER" } });
  if (r.status !== 200) throw new Error(`login failed for ${email}: ${show(r.body)}`);
  return r.body.tokens.accessToken;
}

const stamp = Date.now();
const READ = { read: true, edit: false, delete: false };
const NONE = { read: false, edit: false, delete: false };

async function main() {
  const admin = await tokenFor("priya@gurukulam.test");
  const regional = await tokenFor("arun@gurukulam.test");

  const blr = await prisma.city.findFirstOrThrow({ where: { cityCode: "CITY-BLR" } });
  const hyd = await prisma.city.findFirstOrThrow({ where: { cityCode: "CITY-HYD" } });
  const superAdminRole = await prisma.role.findFirstOrThrow({ where: { name: "Super Admin" } });
  const regionalRole = await prisma.role.findFirstOrThrow({ where: { name: "Regional Sub-Admin" } });
  const priya = await prisma.adminUser.findFirstOrThrow({ where: { email: "priya@gurukulam.test" } });
  const arun = await prisma.adminUser.findFirstOrThrow({ where: { email: "arun@gurukulam.test" } });

  // ── Roles ───────────────────────────────────────────────────────────────
  console.log("\n\x1b[1mRoles carry the permission matrix\x1b[0m");

  const roles = await call("/settings/roles", { token: admin });
  assertOk("roles list", roles);
  expect("…with the seeded ones", roles.body.total >= 2, true);
  expect("…counting who holds each", roles.body.rows.every((r: any) => typeof r.operatorCount === "number"), true);

  const readOnlyRole = await call("/settings/roles", {
    method: "POST", token: admin,
    body: {
      name: `Read Only ${stamp}`, description: "Can look, cannot touch",
      permissions: { dashboard: READ, students: READ, courses: READ },
    },
  });
  assertOk("a role is created", readOnlyRole, 201);
  expect("…with only what was granted", readOnlyRole.body.permissions.students, READ);
  expect("…and nothing implied", readOnlyRole.body.permissions.feeLedger, undefined);
  const readOnlyRoleId = readOnlyRole.body.roleId as string;

  const junk = await call("/settings/roles", {
    method: "POST", token: admin,
    body: { name: `Typo ${stamp}`, permissions: { dashbord: READ, students: READ } },
  });
  // A typo'd module is REFUSED rather than quietly dropped: an operator who
  // wrote "dashbord" believes they granted dashboard access, and a silent
  // drop leaves them wrong with no signal. The service still normalises as a
  // second line of defence.
  expect("a typo'd module name is refused, not silently dropped", junk.status, 400);
  expect("…naming the offending key back", JSON.stringify(junk.body.error.fields).includes("dashbord"), true);

  const dupName = await call("/settings/roles", {
    method: "POST", token: admin, body: { name: `Read Only ${stamp}`, permissions: {} },
  });
  expect("a duplicate role name is refused", dupName.status, 409);

  // ── Escalation ──────────────────────────────────────────────────────────
  console.log("\n\x1b[1mNobody grants what they do not hold\x1b[0m");

  // Arun is a Regional Sub-Admin: read/edit everywhere, delete nowhere.
  const escalateRole = await call("/settings/roles", {
    method: "POST", token: regional,
    body: { name: `Sneaky ${stamp}`, permissions: { students: { read: true, edit: true, delete: true } } },
  });
  // Without this guard, "edit settings" quietly means "become a Super Admin".
  expect("a role granting more than you hold is refused", escalateRole.status, 403);
  expect("…naming what exceeded", escalateRole.body.error.message.includes("students:delete"), true);

  const allowedRole = await call("/settings/roles", {
    method: "POST", token: regional,
    body: { name: `Within Reach ${stamp}`, permissions: { students: { read: true, edit: true, delete: false } } },
  });
  assertOk("a role within your own grant is allowed", allowedRole, 201);

  const editOwnRole = await call(`/settings/roles/${regionalRole.roleId}`, {
    method: "PATCH", token: regional, body: { permissions: { settings: { read: true, edit: true, delete: true } } },
  });
  // Editing the role you hold widens your own access without ever touching
  // your own record.
  expect("you cannot rewrite the role you hold", editOwnRole.status, 403);

  const systemRoleDelete = await call(`/settings/roles/${superAdminRole.roleId}`, {
    method: "DELETE", token: admin,
  });
  expect("a system role cannot be deleted", systemRoleDelete.status, 409);
  expect("…because nobody could restore it", systemRoleDelete.body.error.message.includes("restore"), true);

  const heldRoleDelete = await call(`/settings/roles/${regionalRole.roleId}`, {
    method: "DELETE", token: admin,
  });
  expect("a role someone holds cannot be deleted", heldRoleDelete.status, 409);

  // ── Administrators ──────────────────────────────────────────────────────
  console.log("\n\x1b[1mCreating an operator issues a one-time credential\x1b[0m");

  const created = await call("/settings/administrators", {
    method: "POST", token: admin,
    body: {
      name: `New Operator ${stamp}`, email: `newop.${stamp}@gurukulam.test`,
      roleId: readOnlyRoleId, cityScope: [blr.cityId],
    },
  });
  assertOk("an operator is created", created, 201);
  expect("…with a one-time password", created.body.temporaryPassword.length >= 10, true);
  expect("…that must be reset", created.body.mustResetPassword, true);
  const newOpId = created.body.adminUserId as string;

  const stored = await prisma.adminUser.findFirstOrThrow({ where: { adminUserId: newOpId } });
  expect("only the hash is stored", stored.passwordHash.includes(created.body.temporaryPassword), false);

  const newOpToken = await tokenFor(created.body.email, created.body.temporaryPassword);
  ok("the issued credential signs in", created.body.email);

  const theirView = await call("/auth/me", { token: newOpToken });
  expect("…with exactly the granted permissions", theirView.body.permissions.students, READ);
  expect("…and no others", theirView.body.permissions.feeLedger, undefined);
  expect("…scoped to the given city", theirView.body.cityScope, [blr.cityId]);

  const cannotEdit = await call("/students", {
    method: "POST", token: newOpToken, body: { firstName: "No", email: `no.${stamp}@t.test` },
  });
  expect("read-only really is read-only", cannotEdit.status, 403);

  const dupEmail = await call("/settings/administrators", {
    method: "POST", token: admin,
    body: { name: "Clash", email: created.body.email, roleId: readOnlyRoleId, cityScope: [] },
  });
  expect("a duplicate operator email is refused", dupEmail.status, 409);

  // ── Scope escalation ────────────────────────────────────────────────────
  console.log("\n\x1b[1mA scoped operator cannot hand out reach they lack\x1b[0m");

  const grantGlobal = await call("/settings/administrators", {
    method: "POST", token: regional,
    body: { name: "Global Grant", email: `gg.${stamp}@t.test`, roleId: readOnlyRoleId, cityScope: [] },
  });
  // An empty cityScope means GLOBAL, so this is the widest possible grant.
  expect("a scoped operator cannot grant global scope", grantGlobal.status, 403);

  const grantOutside = await call("/settings/administrators", {
    method: "POST", token: regional,
    body: { name: "Outside", email: `out.${stamp}@t.test`, roleId: readOnlyRoleId, cityScope: [hyd.cityId] },
  });
  expect("…nor a region outside their own", grantOutside.status, 403);

  const grantWithin = await call("/settings/administrators", {
    method: "POST", token: regional,
    body: { name: `Within ${stamp}`, email: `within.${stamp}@t.test`, roleId: readOnlyRoleId, cityScope: [blr.cityId] },
  });
  assertOk("…but may grant within it", grantWithin, 201);

  const assignSuper = await call(`/settings/administrators/${newOpId}`, {
    method: "PATCH", token: regional, body: { roleId: superAdminRole.roleId },
  });
  // Escalation by proxy: assigning a role that holds more than you do.
  expect("assigning a role beyond your own is refused", assignSuper.status, 403);

  const badCity = await call("/settings/administrators", {
    method: "POST", token: admin,
    body: { name: "Ghost", email: `ghost.${stamp}@t.test`, roleId: readOnlyRoleId, cityScope: ["00000000-0000-0000-0000-000000000000"] },
  });
  expect("a scope naming a city that does not exist is refused", badCity.status, 400);

  // ── Invariant 19 ────────────────────────────────────────────────────────
  console.log("\n\x1b[1mInvariant 19 — nobody edits their own role, scope or status\x1b[0m");

  const ownRole = await call(`/settings/administrators/${arun.adminUserId}`, {
    method: "PATCH", token: regional, body: { roleId: superAdminRole.roleId },
  });
  expect("you cannot change your own role", ownRole.status, 403);

  const ownScope = await call(`/settings/administrators/${arun.adminUserId}`, {
    method: "PATCH", token: regional, body: { cityScope: [blr.cityId, hyd.cityId] },
  });
  // The one that makes the whole scope model advisory if it slips.
  expect("you cannot widen your own region scope", ownScope.status, 403);

  const ownStatus = await call(`/settings/administrators/${arun.adminUserId}`, {
    method: "PATCH", token: regional, body: { accountStatus: "SUSPENDED" },
  });
  expect("you cannot change your own account status", ownStatus.status, 403);

  const ownName = await call(`/settings/administrators/${arun.adminUserId}`, {
    method: "PATCH", token: regional, body: { phone: "+919800000999" },
  });
  expect("but a harmless field about yourself is fine", ownName.status, 200);

  const selfDelete = await call(`/settings/administrators/${arun.adminUserId}`, {
    method: "DELETE", token: regional,
  });
  expect("you cannot delete your own account", selfDelete.status, 403);

  // ── Lockout ─────────────────────────────────────────────────────────────
  console.log("\n\x1b[1mThe last Super Admin cannot be removed\x1b[0m");

  const superAdmins = await prisma.adminUser.count({
    where: { roleId: superAdminRole.roleId, deletedAt: null, accountStatus: "ACTIVE" },
  });
  expect("there is exactly one Super Admin to protect", superAdmins, 1);

  const secondSuper = await call("/settings/administrators", {
    method: "POST", token: admin,
    body: { name: `Second Super ${stamp}`, email: `super2.${stamp}@gurukulam.test`, roleId: superAdminRole.roleId, cityScope: [] },
  });
  assertOk("a second Super Admin can be created", secondSuper, 201);
  const secondSuperToken = await tokenFor(secondSuper.body.email, secondSuper.body.temporaryPassword);

  const demoteLast = await call(`/settings/administrators/${priya.adminUserId}`, {
    method: "PATCH", token: secondSuperToken, body: { roleId: readOnlyRoleId },
  });
  expect("with two, one can be demoted", demoteLast.status, 200);

  const demoteTheOther = await call(`/settings/administrators/${secondSuper.body.adminUserId}`, {
    method: "PATCH", token: secondSuperToken, body: { roleId: readOnlyRoleId },
  });
  // They would be editing their own role anyway, but the lockout rule is the
  // one that matters here.
  expect("the last one cannot demote themselves", demoteTheOther.status, 403);

  // Restore Priya so the rest of the suites keep working.
  await prisma.adminUser.update({
    where: { adminUserId: priya.adminUserId }, data: { roleId: superAdminRole.roleId },
  });
  const adminAgain = await tokenFor("priya@gurukulam.test");

  const deleteLast = await call(`/settings/administrators/${secondSuper.body.adminUserId}`, {
    method: "DELETE", token: adminAgain,
  });
  expect("with two again, one can be deleted", deleteLast.status, 204);

  const nowLast = await call(`/settings/administrators/${priya.adminUserId}`, {
    method: "DELETE", token: adminAgain,
  });
  expect("…and then the survivor cannot be", nowLast.status, 403);

  // ── Suspension bites now ────────────────────────────────────────────────
  console.log("\n\x1b[1mSuspension ends the session, not just future logins\x1b[0m");

  const suspended = await call(`/settings/administrators/${newOpId}`, {
    method: "PATCH", token: adminAgain, body: { accountStatus: "SUSPENDED" },
  });
  expect("an operator can be suspended", suspended.body.accountStatus, "SUSPENDED");

  const afterSuspend = await call("/auth/me", { token: newOpToken });
  // The principal is rebuilt from the database per request, so this bites
  // immediately rather than at token expiry.
  expect("their existing access token stops working at once", afterSuspend.status, 403);
  const sessions = await prisma.refreshToken.count({
    where: { actorType: "ADMIN_USER", actorId: newOpId, revokedAt: null },
  });
  expect("…and their refresh sessions were revoked", sessions, 0);

  const reset = await call(`/settings/administrators/${newOpId}/reset-password`, {
    method: "POST", token: adminAgain,
  });
  assertOk("a password can be reset for them", reset);
  expect("…returning a new one-time password", reset.body.temporaryPassword !== created.body.temporaryPassword, true);

  // ── The account screen ──────────────────────────────────────────────────
  console.log("\n\x1b[1mThe account screen is photo-only (invariant 19)\x1b[0m");

  const account = await call("/account", { token: regional });
  assertOk("an operator sees their own account", account);
  expect("…with their role shown", account.body.roleName, "Regional Sub-Admin");
  expect("…and their scope named, not just id'd", account.body.cityNames, ["Bengaluru"]);
  // Spelled out so a UI does not have to infer why the rest is locked.
  expect("…declaring exactly what is editable", account.body.editable, ["photoUrl"]);

  const photo = await call("/account", {
    method: "PUT", token: regional, body: { photoUrl: "https://cdn.example.test/arun.jpg" },
  });
  expect("the photo can be changed", photo.body.photoUrl, "https://cdn.example.test/arun.jpg");
  expect("…and nothing else moved", photo.body.roleName, "Regional Sub-Admin");

  const smuggle = await call("/account", {
    method: "PUT", token: regional,
    body: { photoUrl: null, roleId: superAdminRole.roleId, cityScope: [hyd.cityId] },
  });
  // Accepting and silently ignoring them would leave an operator believing a
  // change took effect.
  expect("extra fields are rejected outright, not ignored", smuggle.status, 400);

  const stillScoped = await call("/auth/me", { token: regional });
  expect("their scope is untouched", stillScoped.body.cityScope, [blr.cityId]);

  const anonAccount = await call("/account");
  expect("the account screen is never public", anonAccount.status, 401);

  // Cleanup so repeated runs stay clean.
  await prisma.adminUser.updateMany({
    where: { adminUserId: { in: [newOpId, grantWithin.body.adminUserId] } },
    data: { deletedAt: new Date() },
  });
  await prisma.role.updateMany({
    where: { roleId: { in: [readOnlyRoleId, allowedRole.body.roleId] } },
    data: { deletedAt: new Date() },
  });

  console.log(`\n${failed === 0 ? "\x1b[32m" : "\x1b[31m"}${passed} passed, ${failed} failed\x1b[0m\n`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
