/**
 * The three modules that were partial: M2 Localisation, M3's requirements and
 * portal access, and M5's availability calendar — plus the portal login
 * identity scheme.
 *
 *     pnpm --filter @gurukulam/api verify:completions
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
async function tokenFor(email: string, actor = "ADMIN_USER", password = PASSWORD): Promise<string> {
  const r = await call("/auth/login", { method: "POST", body: { email, password, actor } });
  if (r.status !== 200) throw new Error(`login failed for ${email}: ${show(r.body)}`);
  return r.body.tokens.accessToken;
}

const stamp = Date.now();
const suffix = String(stamp).slice(-4);

async function main() {
  const admin = await tokenFor("priya@gurukulam.test");
  const india = await prisma.country.findFirstOrThrow({ where: { iso2: "IN" } });
  const blr = await prisma.city.findFirstOrThrow({ where: { cityCode: "CITY-BLR" } });

  // ── M2 Localisation ─────────────────────────────────────────────────────
  console.log("\n\x1b[1mM2 — Localisation\x1b[0m");

  const countries = await call("/localisation/countries", { token: admin });
  assertOk("countries list", countries);
  expect("…including the seeded one", countries.body.rows.some((c: any) => c.iso2 === "IN"), true);
  expect("…with its city count", countries.body.rows.find((c: any) => c.iso2 === "IN").cityCount >= 2, true);

  const dupCountry = await call("/localisation/countries", {
    method: "POST", token: admin,
    body: { name: "India Again", iso2: "IN", iso3: "IND", dialCode: "+91", currency: "INR", timezone: "Asia/Kolkata" },
  });
  expect("a duplicate ISO-2 is refused", dupCountry.status, 409);

  const newCountry = await call("/localisation/countries", {
    method: "POST", token: admin,
    body: { name: `Testland ${suffix}`, iso2: "ZZ", iso3: "ZZZ", dialCode: "+999", currency: "TLD", timezone: "UTC" },
  });
  assertOk("a country is created", newCountry, 201);
  expect("…with a derived code", newCountry.body.countryCode, "CTRY-ZZ");

  // A business ID is never reused, so re-adding an ARCHIVED country has to
  // revive it — otherwise archiving one makes its ISO code permanently
  // unusable and the retry surfaces as a 500.
  await call(`/localisation/countries/${newCountry.body.countryId}`, { method: "DELETE", token: admin });
  const revived = await call("/localisation/countries", {
    method: "POST", token: admin,
    body: { name: `Testland reopened ${suffix}`, iso2: "ZZ", iso3: "ZZZ", dialCode: "+999", currency: "TLD", timezone: "UTC" },
  });
  assertOk("re-adding an archived country revives it", revived, 201);
  expect("…as the same record", revived.body.countryId, newCountry.body.countryId);
  expect("…keeping its business ID", revived.body.countryCode, "CTRY-ZZ");
  expect("…and no longer archived", revived.body.deletedAt, null);

  const newCity = await call("/localisation/cities", {
    method: "POST", token: admin,
    body: { countryId: newCountry.body.countryId, name: `Testville ${suffix}` },
  });
  assertOk("a city is created", newCity, 201);
  expect("…with a derived code", newCity.body.cityCode.startsWith("CITY-"), true);
  // A city with no timezone breaks session scheduling silently, so it inherits.
  expect("…inheriting its country's timezone", newCity.body.timezone, "UTC");

  const deleteCountryWithCities = await call(`/localisation/countries/${newCountry.body.countryId}`, {
    method: "DELETE", token: admin,
  });
  expect("a country with cities cannot be archived", deleteCountryWithCities.status, 409);

  // Cities are the unit operators are scoped TO — archiving one with records
  // behind it would leave them reachable by nobody but a global admin.
  const deleteBusyCity = await call(`/localisation/cities/${blr.cityId}`, { method: "DELETE", token: admin });
  expect("a city with records cannot be archived", deleteBusyCity.status, 409);
  expect("…naming what it still holds", /college|student|batch|trainer/.test(deleteBusyCity.body.error.message), true);

  const emptyCityGone = await call(`/localisation/cities/${newCity.body.cityId}`, { method: "DELETE", token: admin });
  expect("an empty city archives", emptyCityGone.status, 204);
  const stillThere = await prisma.city.findUnique({ where: { cityId: newCity.body.cityId } });
  expect("…softly", stillThere?.deletedAt !== null, true);

  await call(`/localisation/countries/${newCountry.body.countryId}`, { method: "DELETE", token: admin });

  // ── M3 Requirements ─────────────────────────────────────────────────────
  console.log("\n\x1b[1mM3 — the college engagement's entry point\x1b[0m");

  const collegeUser = await tokenFor("snc@gurukulam.com", "COLLEGE_USER");
  const snc = await prisma.college.findFirstOrThrow({ where: { collegeCode: "CLG-SNC-01" } });

  const course = await call("/courses", {
    method: "POST", token: admin,
    body: { name: `Req Probe ${stamp}`, standardMarketValue: "25000", topics: [{ title: "One" }] },
  });
  const courseId = course.body.courseId as string;

  const raised = await call("/colleges/requirements", {
    method: "POST", token: collegeUser,
    body: {
      courseId, expectedHeadcount: 35, preferredMode: "OFFLINE",
      preferredWindowStart: "2027-01-05", preferredWindowEnd: "2027-03-30",
      discipline: "CSE", notes: "Final-year upskilling",
    },
  });
  assertOk("a college raises a requirement", raised, 201);
  expect("…scoped to their own college automatically", raised.body.collegeId, snc.collegeId);
  expect("…starting as NEW", raised.body.status, "NEW");
  expect("…with a generated code", /^REQ-\d{4}-\d{3}$/.test(raised.body.requirementCode), true);
  expect("…attributed to the portal", raised.body.source, "College portal");
  expect("…and no batch yet", raised.body.batchId, null);
  const reqId = raised.body.requirementId as string;

  const backwardsWindow = await call("/colleges/requirements", {
    method: "POST", token: collegeUser,
    body: { courseId, expectedHeadcount: 10, preferredWindowStart: "2027-03-01", preferredWindowEnd: "2027-01-01" },
  });
  expect("a backwards window is refused", backwardsWindow.status, 400);

  const collegeConfirms = await call(`/colleges/requirements/${reqId}/confirm`, {
    method: "POST", token: collegeUser,
    body: { batchName: "Self-serve", startDate: "2027-01-05" },
  });
  // Colleges do not create batches — an admin does, from a confirmed
  // requirement.
  expect("a college cannot confirm its own requirement", collegeConfirms.status, 403);

  const confirmed = await call(`/colleges/requirements/${reqId}/confirm`, {
    method: "POST", token: admin,
    body: { batchName: `SNC upskilling ${suffix}`, startDate: "2027-01-05", endDate: "2027-03-30", venue: "SNC Hall A" },
  });
  assertOk("an admin confirms it", confirmed);
  expect("…moving to CONFIRMED", confirmed.body.status, "CONFIRMED");
  // Invariant 14 — the two are one act.
  expect("…and it now names the batch it produced", confirmed.body.batchId !== null, true);
  expect("…with the batch code surfaced", confirmed.body.batchCode !== null, true);

  const batch = await prisma.batch.findFirstOrThrow({ where: { batchId: confirmed.body.batchId } });
  expect("the batch is dedicated to that college", batch.collegeId, snc.collegeId);
  expect("…inheriting the college's city", batch.cityId, snc.cityId);
  expect("…and the requirement's headcount as capacity", batch.maxCapacity, 35);

  const confirmTwice = await call(`/colleges/requirements/${reqId}/confirm`, {
    method: "POST", token: admin, body: { batchName: "Again", startDate: "2027-02-01" },
  });
  expect("confirming twice is refused", confirmTwice.status, 409);

  const editConfirmed = await call(`/colleges/requirements/${reqId}`, {
    method: "PATCH", token: admin, body: { expectedHeadcount: 50 },
  });
  // Editing what was asked for after the batch exists leaves the batch
  // answering a question nobody put.
  expect("a confirmed requirement cannot be edited", editConfirmed.status, 409);

  const toReject = await call("/colleges/requirements", {
    method: "POST", token: admin,
    body: { collegeId: snc.collegeId, courseId, expectedHeadcount: 5 },
  });
  const noReason = await call(`/colleges/requirements/${toReject.body.requirementId}/reject`, {
    method: "POST", token: admin, body: {},
  });
  expect("rejecting without a reason is refused", noReason.status, 400);
  const rejected = await call(`/colleges/requirements/${toReject.body.requirementId}/reject`, {
    method: "POST", token: admin, body: { reason: "Headcount below our minimum cohort" },
  });
  expect("a requirement can be rejected", rejected.body.status, "REJECTED");
  const confirmRejected = await call(`/colleges/requirements/${toReject.body.requirementId}/confirm`, {
    method: "POST", token: admin, body: { batchName: "No", startDate: "2027-01-05" },
  });
  expect("a rejected requirement cannot then be confirmed", confirmRejected.status, 409);

  // ── Portal access ───────────────────────────────────────────────────────
  console.log("\n\x1b[1mM3 — portal access, and the login identity\x1b[0m");

  const newCollege = await call("/colleges", {
    method: "POST", token: admin,
    body: {
      name: `Vidya Institute ${suffix}`, countryId: india.countryId, cityId: blr.cityId,
      disciplines: ["CSE"],
      pocs: [{ name: "T&P Officer", email: `tpo.${stamp}@vidya.test`, isPrimary: true }],
    },
  });
  const vidyaId = newCollege.body.collegeId as string;
  const vidya = await call(`/colleges/${vidyaId}`, { token: admin });
  const pocId = vidya.body.pocs[0].pocId as string;

  const granted = await call(`/colleges/${vidyaId}/access`, {
    method: "POST", token: admin, body: { pocId },
  });
  assertOk("portal access is granted", granted, 201);
  // Derived from the college's immutable code — unique by construction.
  expect("…with a derived login identity", granted.body.loginEmail, `vi${suffix.slice(-1)}@gurukulam.com`.replace(/^vi\d@/, granted.body.loginEmail.split("@")[0] + "@"));
  expect("…in the portal domain", granted.body.loginEmail.endsWith("@gurukulam.com"), true);
  expect("…and a one-time password", granted.body.temporaryPassword.length >= 10, true);
  expect("…that must be reset", granted.body.mustResetPassword, true);

  const stored = await prisma.collegeUser.findFirstOrThrow({ where: { collegeUserId: granted.body.collegeUserId } });
  // A credential that can be re-read is one an operator can leak unknowingly.
  expect("only the hash is stored", stored.passwordHash?.includes(granted.body.temporaryPassword), false);
  // The contact address is untouched — invoices go there (invariant 6).
  expect("the contact address is left alone", stored.email, `tpo.${stamp}@vidya.test`);
  expect("…distinct from the login identity", stored.email === stored.loginEmail, false);

  const newUserToken = await tokenFor(granted.body.loginEmail, "COLLEGE_USER", granted.body.temporaryPassword);
  ok("the issued credential signs in", granted.body.loginEmail);

  const theirColleges = await call("/colleges", { token: newUserToken });
  expect("…scoped to their own college", theirColleges.body.total, 1);
  expect("…which is the right one", theirColleges.body.rows[0].collegeId, vidyaId);

  const revoked = await call(`/colleges/access/${granted.body.collegeUserId}/revoke`, {
    method: "POST", token: admin, body: { reason: "Officer left the institution" },
  });
  assertOk("access is revoked", revoked);
  expect("…recorded as REVOKED", revoked.body.accessStatus, "REVOKED");

  const afterRevoke = await call("/auth/login", {
    method: "POST",
    body: { email: granted.body.loginEmail, password: granted.body.temporaryPassword, actor: "COLLEGE_USER" },
  });
  // Revocation must bite immediately, not at token expiry.
  expect("the revoked credential no longer signs in", afterRevoke.status, 401);
  const liveSessions = await prisma.refreshToken.count({
    where: { actorType: "COLLEGE_USER", actorId: granted.body.collegeUserId, revokedAt: null },
  });
  expect("…and existing sessions were killed", liveSessions, 0);

  const revokeTwice = await call(`/colleges/access/${granted.body.collegeUserId}/revoke`, {
    method: "POST", token: admin, body: {},
  });
  expect("revoking twice is refused", revokeTwice.status, 409);

  // ── M5 Availability ─────────────────────────────────────────────────────
  console.log("\n\x1b[1mM5 — the availability calendar (invariant 8)\x1b[0m");

  const trainer = await call("/trainers", {
    method: "POST", token: admin,
    body: { name: `Avail Trainer ${suffix}`, email: `avail.${stamp}@t.test`, skillTags: [], cityId: blr.cityId, maxWeeklyHours: 20 },
  });
  const trainerId = trainer.body.trainerId as string;
  await call(`/trainers/${trainerId}/courses`, { method: "PUT", token: admin, body: { courseIds: [courseId] } });

  const leave = await call(`/trainers/${trainerId}/availability`, {
    method: "POST", token: admin,
    body: { type: "LEAVE", startsAt: "2027-02-01T00:00:00Z", endsAt: "2027-02-07T23:59:59Z", reason: "Annual leave" },
  });
  assertOk("leave is declared", leave, 201);
  expect("…as LEAVE", leave.body.type, "LEAVE");

  const overlapping = await call(`/trainers/${trainerId}/availability`, {
    method: "POST", token: admin,
    body: { startsAt: "2027-02-05T00:00:00Z", endsAt: "2027-02-10T00:00:00Z" },
  });
  expect("overlapping leave is refused", overlapping.status, 409);

  const backwards = await call(`/trainers/${trainerId}/availability`, {
    method: "POST", token: admin,
    body: { startsAt: "2027-03-10T00:00:00Z", endsAt: "2027-03-01T00:00:00Z" },
  });
  expect("leave ending before it starts is refused", backwards.status, 400);

  const calendarBusy = await call(
    `/trainers/calendar?from=2027-02-01&to=2027-02-07&courseId=${courseId}`, { token: admin });
  assertOk("the calendar answers for a window", calendarBusy);
  const entry = calendarBusy.body.find((e: any) => e.trainerId === trainerId);
  expect("…finding the trainer", entry !== undefined, true);
  // Free/busy is computed, never stored.
  expect("…counting their declared leave", entry.declaredAway, 1);
  expect("…so they are not free", entry.free, false);
  // The question the picker is really asking (invariant 15).
  expect("…and reporting course approval", entry.approvedForCourse, true);

  const calendarFree = await call(
    `/trainers/calendar?from=2027-05-01&to=2027-05-07&courseId=${courseId}&freeOnly=true`, { token: admin });
  const freeEntry = calendarFree.body.find((e: any) => e.trainerId === trainerId);
  expect("outside the leave they are free", freeEntry?.free, true);
  expect("…with nothing committed", freeEntry?.committedSessions, 0);

  // The other half of invariant 8: a committed session makes them busy, and
  // leave cannot then be declared over it.
  const dedicated = await call("/batches", {
    method: "POST", token: admin,
    body: { name: `Avail batch ${suffix}`, courseId, cityId: blr.cityId, startDate: "2027-05-03" },
  });
  await call(`/batches/${dedicated.body.batchId}/trainer/propose`, {
    method: "POST", token: admin, body: { trainerId },
  });
  await call(`/batches/${dedicated.body.batchId}/trainer/respond`, {
    method: "POST", token: admin, body: { decision: "CONFIRM" },
  });
  await call("/batches/sessions", {
    method: "POST", token: admin,
    body: { batchId: dedicated.body.batchId, title: "Committed", scheduledDate: "2027-05-04", startTime: "10:00", endTime: "13:00" },
  });

  const nowBusy = await call(`/trainers/calendar?from=2027-05-01&to=2027-05-07`, { token: admin });
  const busyEntry = nowBusy.body.find((e: any) => e.trainerId === trainerId);
  expect("a committed session makes them busy", busyEntry.committedSessions, 1);
  expect("…with the hours counted", busyEntry.committedHours, 3);
  expect("…so they are no longer free", busyEntry.free, false);

  const leaveOverSession = await call(`/trainers/${trainerId}/availability`, {
    method: "POST", token: admin,
    body: { startsAt: "2027-05-04T00:00:00Z", endsAt: "2027-05-04T23:59:00Z" },
  });
  // Accepting it would make the calendar assert two contradictory things.
  expect("leave over a committed session is refused", leaveOverSession.status, 409);
  expect("…naming the batch", leaveOverSession.body.error.message.includes(dedicated.body.batchCode), true);

  const withdrawn = await call(`/trainers/availability/${leave.body.availabilityId}`, {
    method: "DELETE", token: admin,
  });
  expect("leave can be withdrawn", withdrawn.status, 204);

  console.log(`\n${failed === 0 ? "\x1b[32m" : "\x1b[31m"}${passed} passed, ${failed} failed\x1b[0m\n`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
