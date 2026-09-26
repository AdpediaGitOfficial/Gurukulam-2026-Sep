/**
 * The cross-college roll-ups, driven against the live API.
 *
 * What matters here is not that the pages render: it is that the two new
 * endpoints agree with the per-college views they summarise, and that both
 * scope axes still bite. A roll-up that quietly widens scope is the worst
 * possible bug in this module.
 */
import { collegeContactSchema, collegeUserSchema } from "@gurukulam/contracts";
import { PrismaClient } from "@gurukulam/db";
import { clearRateLimit } from "./_rate-limit";

const BASE = process.env.API_URL ?? "http://127.0.0.1:4000/api/v1";
const PASSWORD = "Gurukulam@2026";
const prisma = new PrismaClient();

let passed = 0, failed = 0;
const ok = (n: string, d = "") => (passed++, console.log(`  \x1b[32m✓\x1b[0m ${n}${d ? `  \x1b[90m${d}\x1b[0m` : ""}`));
const bad = (n: string, d: string) => (failed++, console.log(`  \x1b[31m✗\x1b[0m ${n}\n      \x1b[31m${d}\x1b[0m`));

async function signIn(email: string): Promise<string> {
  const r = await fetch(`${BASE}/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const b = (await r.json()) as { tokens?: { accessToken: string } };
  if (!b.tokens) throw new Error(`sign in ${email}: ${JSON.stringify(b)}`);
  return b.tokens.accessToken;
}
const get = async (t: string, p: string) =>
  (await fetch(`${BASE}${p}`, { headers: { authorization: `Bearer ${t}` } })).json() as Promise<any>;

async function main() {
  await clearRateLimit();
  const admin = await signIn("priya@gurukulam.test");

  // ── shape ────────────────────────────────────────────────────────────────
  const contacts = await get(admin, "/colleges/contacts?pageSize=100");
  const parsedContacts = contacts.rows?.map((r: unknown) => collegeContactSchema.safeParse(r));
  const badContact = parsedContacts?.find((p: any) => !p.success);
  badContact
    ? bad("contacts shape", JSON.stringify(badContact.error.issues.slice(0, 3)))
    : ok("contacts shape", `${contacts.rows.length} of ${contacts.total}`);

  const access = await get(admin, "/colleges/access?pageSize=100");
  const parsedAccess = access.rows?.map((r: unknown) => collegeUserSchema.safeParse(r));
  const badAccess = parsedAccess?.find((p: any) => !p.success);
  badAccess
    ? bad("access shape", JSON.stringify(badAccess.error.issues.slice(0, 3)))
    : ok("access shape", `${access.rows.length} of ${access.total}`);

  // No password hash escapes, ever.
  const leaked = [...(contacts.rows ?? []), ...(access.rows ?? [])].some(
    (r: any) => "passwordHash" in r || "password_hash" in r,
  );
  leaked ? bad("no credential leak", "a password hash came back") : ok("no credential leak");

  // ── totals agree with the database ───────────────────────────────────────
  const liveContacts = await prisma.collegePoc.count({
    where: { deletedAt: null, college: { deletedAt: null } },
  });
  contacts.total === liveContacts
    ? ok("contacts total matches the database", `${liveContacts}`)
    : bad("contacts total matches the database", `api ${contacts.total} vs db ${liveContacts}`);

  const liveAccounts = await prisma.collegeUser.count({
    where: { deletedAt: null, college: { deletedAt: null } },
  });
  access.total === liveAccounts
    ? ok("access total matches the database", `${liveAccounts}`)
    : bad("access total matches the database", `api ${access.total} vs db ${liveAccounts}`);

  // ── the roll-up agrees with the per-college view ─────────────────────────
  const college = await prisma.college.findFirst({
    where: { deletedAt: null, pocs: { some: { deletedAt: null } } },
    select: { collegeId: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (college) {
    const detail = await get(admin, `/colleges/${college.collegeId}`);
    const rolled = await get(admin, `/colleges/contacts?collegeId=${college.collegeId}&pageSize=100`);
    const a = new Set<string>(detail.pocs.map((p: any) => p.pocId));
    const b = new Set<string>(rolled.rows.map((r: any) => r.pocId));
    a.size === b.size && [...a].every((id) => b.has(id))
      ? ok("same contacts as the college record", `${college.name}: ${a.size}`)
      : bad("same contacts as the college record", `detail ${a.size} vs roll-up ${b.size}`);

    // Primary first, within a college.
    const firstRow = rolled.rows[0];
    const anyPrimary = rolled.rows.some((r: any) => r.isPrimary);
    !anyPrimary || firstRow?.isPrimary
      ? ok("primary contact sorts first")
      : bad("primary contact sorts first", `first row is ${firstRow?.name}`);

    const accountsHere = await get(admin, `/colleges/${college.collegeId}/access`);
    const rolledAccess = await get(admin, `/colleges/access?collegeId=${college.collegeId}&pageSize=100`);
    const x = new Set<string>(accountsHere.map((u: any) => u.collegeUserId));
    const y = new Set<string>(rolledAccess.rows.map((r: any) => r.collegeUserId));
    x.size === y.size && [...x].every((id) => y.has(id))
      ? ok("same accounts as the college's access page", `${x.size}`)
      : bad("same accounts as the college's access page", `per-college ${x.size} vs roll-up ${y.size}`);
  } else {
    bad("same contacts as the college record", "no college with contacts to compare");
  }

  // ── hasPortalAccess actually reflects an account ─────────────────────────
  const withAccount = contacts.rows.filter((r: any) => r.portalAccessStatus !== null);
  const claimed = withAccount.map((r: any) => r.pocId);
  const real = claimed.length === 0 ? [] : await prisma.collegeUser.findMany({
    where: { pocId: { in: claimed }, deletedAt: null },
    select: { pocId: true, accessStatus: true },
  });
  const byPoc = new Map(real.map((u) => [u.pocId, u.accessStatus]));
  const wrong = withAccount.filter((r: any) => byPoc.get(r.pocId) !== r.portalAccessStatus);
  claimed.length === 0
    ? ok("portal access column", "no contact holds an account — nothing to check")
    : wrong.length === 0
      ? ok("portal access column matches the accounts", `${claimed.length} contacts`)
      : bad("portal access column matches the accounts", `${wrong.length} disagree, e.g. ${wrong[0].name}`);

  const withoutAccount = contacts.rows.filter((r: any) => r.portalAccessStatus === null);
  const falseNegative = withoutAccount.length === 0 ? 0 : await prisma.collegeUser.count({
    where: { pocId: { in: withoutAccount.map((r: any) => r.pocId) }, deletedAt: null },
  });
  falseNegative === 0
    ? ok("contacts without an account really have none")
    : bad("contacts without an account really have none", `${falseNegative} do have one`);

  // ── filters ──────────────────────────────────────────────────────────────
  // The seed gives every college exactly one contact, and it is primary — so
  // the filter would pass vacuously. Add a second, non-primary contact for the
  // length of this check, then remove the row this probe created.
  const host = await prisma.college.findFirst({
    where: { deletedAt: null }, select: { collegeId: true }, orderBy: { createdAt: "asc" },
  });
  const extra = host === null ? null : await prisma.collegePoc.create({
    data: {
      collegeId: host.collegeId, name: "Probe Secondary Contact",
      email: "probe.secondary@example.invalid", isPrimary: false,
    },
    select: { pocId: true },
  });
  try {
    const primaries = await get(admin, "/colleges/contacts?isPrimary=true&pageSize=200");
    const others = await get(admin, "/colleges/contacts?isPrimary=false&pageSize=200");
    const seenInPrimary = primaries.rows.some((r: any) => r.pocId === extra?.pocId);
    const seenInOthers = others.rows.some((r: any) => r.pocId === extra?.pocId);
    primaries.rows.every((r: any) => r.isPrimary) && !seenInPrimary && seenInOthers
      ? ok("isPrimary filter separates the two", `${primaries.total} primary, ${others.total} not`)
      : bad("isPrimary filter separates the two", `primary ${primaries.total} (contains probe row: ${seenInPrimary}), other ${others.total} (contains it: ${seenInOthers})`);

    // A contact with no account at all — the null the column now distinguishes.
    const unfiltered = await get(admin, "/colleges/contacts?pageSize=200");
    const row = unfiltered.rows.find((r: any) => r.pocId === extra?.pocId);
    row?.portalAccessStatus === null
      ? ok("a contact with no account reads as null")
      : bad("a contact with no account reads as null", `got ${JSON.stringify(row?.portalAccessStatus)}`);
  } finally {
    // Only ever the row this probe created.
    if (extra) await prisma.collegePoc.delete({ where: { pocId: extra.pocId } });
  }

  const granted = await get(admin, "/colleges/access?accessStatus=GRANTED&pageSize=100");
  granted.rows.every((r: any) => r.accessStatus === "GRANTED")
    ? ok("accessStatus filter", `${granted.total} granted`)
    : bad("accessStatus filter", "a non-granted account came back");

  const city = await prisma.college.findFirst({
    where: { deletedAt: null, pocs: { some: { deletedAt: null } } },
    select: { cityId: true, city: { select: { name: true } } },
  });
  if (city) {
    const inCity = await get(admin, `/colleges/contacts?cityId=${city.cityId}&pageSize=100`);
    const expected = await prisma.collegePoc.count({
      where: { deletedAt: null, college: { deletedAt: null, cityId: city.cityId } },
    });
    inCity.total === expected
      ? ok("cityId filter", `${city.city?.name}: ${expected}`)
      : bad("cityId filter", `api ${inCity.total} vs db ${expected}`);
  }

  const search = contacts.rows[0]?.name?.split(" ")[0];
  if (search) {
    const found = await get(admin, `/colleges/contacts?q=${encodeURIComponent(search)}&pageSize=100`);
    found.total >= 1 && found.rows.some((r: any) => r.pocId === contacts.rows[0].pocId)
      ? ok("search finds a known contact", `"${search}" → ${found.total}`)
      : bad("search finds a known contact", `"${search}" → ${found.total}`);
  }

  // ── scope: the whole point ───────────────────────────────────────────────
  const regional = await prisma.adminUser.findFirst({
    where: { deletedAt: null, cityScope: { isEmpty: false } },
    select: { email: true, cityScope: true, name: true },
  });
  if (regional) {
    const token = await signIn(regional.email);
    const scoped = await get(token, "/colleges/contacts?pageSize=200");
    const allowed = await prisma.collegePoc.count({
      where: { deletedAt: null, college: { deletedAt: null, cityId: { in: regional.cityScope } } },
    });
    scoped.total === allowed && scoped.total < liveContacts
      ? ok("city scope narrows contacts", `${regional.name}: ${scoped.total} of ${liveContacts}`)
      : bad("city scope narrows contacts", `api ${scoped.total}, allowed ${allowed}, all ${liveContacts}`);

    const scopedAccess = await get(token, "/colleges/access?pageSize=200");
    const allowedAccess = await prisma.collegeUser.count({
      where: { deletedAt: null, college: { deletedAt: null, cityId: { in: regional.cityScope } } },
    });
    scopedAccess.total === allowedAccess
      ? ok("city scope narrows portal access", `${scopedAccess.total} of ${liveAccounts}`)
      : bad("city scope narrows portal access", `api ${scopedAccess.total} vs allowed ${allowedAccess}`);

    // A scoped operator naming a college outside their cities gets nothing —
    // not an error that confirms the college exists.
    const outside = await prisma.college.findFirst({
      where: { deletedAt: null, cityId: { notIn: regional.cityScope }, pocs: { some: { deletedAt: null } } },
      select: { collegeId: true, name: true },
    });
    if (outside) {
      const attempt = await get(token, `/colleges/contacts?collegeId=${outside.collegeId}&pageSize=100`);
      attempt.total === 0
        ? ok("a filter cannot widen scope", `${outside.name} stays invisible`)
        : bad("a filter cannot widen scope", `${attempt.total} rows leaked from ${outside.name}`);
    }
  } else {
    bad("city scope narrows contacts", "no regional sub-admin in the database");
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
