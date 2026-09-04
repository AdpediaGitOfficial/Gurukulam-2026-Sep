/**
 * Reports, notifications and login rate limiting — the last of the API.
 *
 *     pnpm --filter @gurukulam/api verify:reports
 */
import { PrismaClient } from "@gurukulam/db";
import { clearRateLimit } from "./_rate-limit";

const BASE = process.env.API_URL ?? "http://127.0.0.1:4000/api/v1";
const PASSWORD = "Gurukulam@2026";
const prisma = new PrismaClient({ log: [] });

let passed = 0, failed = 0;
const ok = (n: string, d = "") => { passed++; console.log(`  \x1b[32m✓\x1b[0m ${n}${d ? `  \x1b[90m${d}\x1b[0m` : ""}`); };
const bad = (n: string, d: string) => { failed++; console.log(`  \x1b[31m✗\x1b[0m ${n}\n      \x1b[31m${d}\x1b[0m`); };
const show = (v: unknown) => JSON.stringify(canonical(v));
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

interface Res<T = any> { status: number; body: T; text?: string }
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
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { status: res.status, body, text };
}
async function tokenFor(email: string, actor = "ADMIN_USER"): Promise<string> {
  const r = await call("/auth/login", { method: "POST", body: { email, password: PASSWORD, actor } });
  if (r.status !== 200) throw new Error(`login failed for ${email}: ${show(r.body)}`);
  return r.body.tokens.accessToken;
}

const WINDOW = "from=2026-01-01&to=2027-12-31";


async function main() {
  // The suites share one address; the throttle is not aimed at them.
  await clearRateLimit();

  // A throttle left by a previous run would stop this one before it starts.
  await clearRateLimit();

  const admin = await tokenFor("priya@gurukulam.test");
  const regional = await tokenFor("arun@gurukulam.test");

  // ── The library ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1mThe report library is a grammar, not a menu\x1b[0m");

  const library = await call("/reports", { token: admin });
  assertOk("the library lists", library);
  expect("…the full catalogue", library.body.total >= 30, true);
  expect("…with four built", library.body.built, 4);
  // A SPECIFIED entry that does not name its measures is a title, not a spec.
  const specified = library.body.reports.filter((r: any) => r.status === "SPECIFIED");
  expect("every specified report names its measures", specified.every((r: any) => r.measures.length > 0), true);
  expect("…and its dimensions", specified.every((r: any) => r.dimensions.length > 0), true);
  expect("every built report names its path", library.body.reports.filter((r: any) => r.status === "BUILT").every((r: any) => r.path !== null), true);

  // ── Outstanding ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1mOutstanding & ageing — across both billing parents\x1b[0m");

  const outstanding = await call(`/reports/outstanding?${WINDOW}`, { token: admin });
  assertOk("the report runs", outstanding);
  expect("…with the shared envelope", Object.keys(outstanding.body).sort(), ["measures", "meta", "rows"]);
  expect("…naming its scope", outstanding.body.meta.scope.label, "All regions");
  expect("…and its row count", outstanding.body.meta.rowCount, outstanding.body.rows.length);

  const parents = new Set(outstanding.body.rows.map((r: any) => r.parentType));
  expect("both billing parents appear", [...parents].sort(), ["COLLEGE", "STUDENT"]);
  expect("…each aged into a bucket", outstanding.body.rows.every((r: any) => r.bucket !== undefined), true);
  expect("…with money as a string", typeof outstanding.body.rows[0]?.outstandingMinor, "string");

  const totalMeasure = outstanding.body.measures.find((m: any) => m.key === "outstanding");
  const rowSum = outstanding.body.rows.reduce((t: bigint, r: any) => t + BigInt(r.outstandingMinor), 0n);
  // A headline that disagrees with the rows beneath it is worse than no headline.
  expect("the headline equals the sum of its rows", BigInt(totalMeasure.value), rowSum);

  const retailOnly = await call(`/reports/outstanding?${WINDOW}&segment=RETAIL`, { token: admin });
  expect("segment filters to one parent", new Set(retailOnly.body.rows.map((r: any) => r.parentType)).size <= 1, true);

  // ── Collections ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1mCollection register — reconcilable against a bank\x1b[0m");

  const collections = await call(`/reports/collections?${WINDOW}`, { token: admin });
  assertOk("the register runs", collections);
  expect("…listing receipts", collections.body.rows.length > 0, true);
  expect("…with a transaction code each", collections.body.rows.every((r: any) => r.transactionCode), true);

  const net = collections.body.measures.find((m: any) => m.key === "collected");
  const computed = collections.body.rows.reduce(
    (t: bigint, r: any) => (r.isReversal ? t - BigInt(r.amountMinor) : t + BigInt(r.amountMinor)),
    0n,
  );
  // A register that counts a reversed receipt as income does not reconcile.
  expect("reversals are subtracted, not listed as income", BigInt(net.value), computed);

  const compared = await call(`/reports/collections?${WINDOW}&compare=true`, { token: admin });
  expect("a comparison window is reported", compared.body.meta.comparedFrom !== null, true);
  expect("…and the measure carries a previous figure", compared.body.measures.find((m: any) => m.key === "collected").previous !== null, true);
  expect("…with a delta", compared.body.measures.find((m: any) => m.key === "collected").delta !== null, true);

  // ── CSV ─────────────────────────────────────────────────────────────────
  console.log("\n\x1b[1mCSV comes from the same rows as the JSON\x1b[0m");

  const csv = await call(`/reports/collections?${WINDOW}&format=csv`, { token: admin });
  expect("csv is returned", csv.status, 200);
  const lines = (csv.text ?? "").trim().split("\r\n");
  expect("…with a header row", lines[0]?.includes("transactionCode"), true);
  // Rendered from the same rows rather than a second query that drifts.
  expect("…one line per row", lines.length - 1, collections.body.rows.length);
  expect("…money still in minor units", /,\d+,/.test(lines[1] ?? ""), true);

  // ── Unallocated ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1mUnallocated ageing agrees with the queue it links to\x1b[0m");

  const unallocated = await call(`/reports/unallocated?${WINDOW}`, { token: admin });
  assertOk("the report runs", unallocated);
  const queue = await call("/students/unallocated", { token: admin });
  expect("the report and the students queue agree", unallocated.body.rows.length, queue.body.unallocated.total);
  expect("…each bucketed by age", unallocated.body.rows.every((r: any) => ["D0_3", "D4_7", "D8_14", "D15_PLUS"].includes(r.bucket)), true);
  expect("…recording who onboarded them", unallocated.body.rows.every((r: any) => r.createdByType), true);

  // ── Batch progress ──────────────────────────────────────────────────────
  console.log("\n\x1b[1mBatch progress\x1b[0m");

  const progress = await call(`/reports/batch-progress?${WINDOW}`, { token: admin });
  assertOk("the report runs", progress);
  expect("…with batches", progress.body.rows.length > 0, true);
  // A batch with nothing scheduled is 0%, not NaN.
  expect("progress is a whole percentage, never NaN", progress.body.rows.every((r: any) => Number.isInteger(r.progressPct) && r.progressPct >= 0 && r.progressPct <= 100), true);
  expect("…segmented", progress.body.rows.every((r: any) => ["RETAIL", "COLLEGE"].includes(r.segment)), true);

  // ── Scope ───────────────────────────────────────────────────────────────
  console.log("\n\x1b[1mA report is the easiest place to leak a region\x1b[0m");

  const regionalOutstanding = await call(`/reports/outstanding?${WINDOW}`, { token: regional });
  expect("a scoped operator gets their own figures", regionalOutstanding.status, 200);
  expect("…labelled with their scope", regionalOutstanding.body.meta.scope.label, "1 region");
  expect("…with fewer rows than global", regionalOutstanding.body.rows.length <= outstanding.body.rows.length, true);
  expect("…and a smaller total", BigInt(regionalOutstanding.body.measures[0].value) <= BigInt(outstanding.body.measures[0].value), true);

  const regionalProgress = await call(`/reports/batch-progress?${WINDOW}`, { token: regional });
  const hyd = await prisma.city.findFirstOrThrow({ where: { cityCode: "CITY-HYD" } });
  const hydBatches = await prisma.batch.findMany({ where: { cityId: hyd.cityId, deletedAt: null }, select: { batchId: true } });
  const leaked = regionalProgress.body.rows.some((r: any) => hydBatches.some((b) => b.batchId === r.batchId));
  expect("no out-of-region batch appears", leaked, false);

  const backwards = await call("/reports/outstanding?from=2027-01-01&to=2026-01-01", { token: admin });
  expect("a backwards window is refused", backwards.status, 400);

  // ── Notifications ───────────────────────────────────────────────────────
  console.log("\n\x1b[1mThe bell is a work queue that can reach zero\x1b[0m");

  const catalogue = await call("/notifications/catalogue", { token: admin });
  assertOk("the catalogue lists", catalogue);
  expect("…every type naming what clears it", catalogue.body.types.every((t: any) => t.clearsWhen), true);
  expect("…with live ones marked", catalogue.body.live >= 9, true);

  // The sweep runs from the nightly cron.
  const cronRun = await call("/cron/fee-reminders", { method: "POST" });
  expect("the cron is still behind its secret", cronRun.status, 401);

  const secret = process.env.CRON_SHARED_SECRET ?? "local-dev-cron-secret";
  await fetch(`${BASE}/cron/fee-reminders`, { method: "POST", headers: { "x-cron-secret": secret } });

  const bell = await call("/notifications/bell", { token: admin });
  assertOk("the bell renders", bell);
  expect("…counting action required", bell.body.actionRequired > 0, true);
  // FYI never badges: a badge that never clears trains people to ignore it.
  expect("…and badging only action and alerts", bell.body.badge, bell.body.actionRequired + bell.body.alerts);

  const grouped = bell.body.items.filter((i: any) => i.type === "students.unallocated");
  // Nine unallocated students are ONE row saying nine, not nine rows.
  expect("a situation is one row, not one per record", grouped.length, 1);
  expect("…whose title carries the count", /\d+/.test(grouped[0]?.title ?? ""), true);
  expect("…and a way to act on it", grouped[0]?.ctaHref, "/students?allocated=false");

  // Sweeping again must not duplicate.
  const before = await prisma.notification.count({ where: { groupKey: "students.unallocated", status: { not: "RESOLVED" } } });
  await fetch(`${BASE}/cron/fee-reminders`, { method: "POST", headers: { "x-cron-secret": secret } });
  const after = await prisma.notification.count({ where: { groupKey: "students.unallocated", status: { not: "RESOLVED" } } });
  expect("re-sweeping updates rather than duplicating", after, before);

  const markAction = await call("/notifications/read", {
    method: "POST", token: admin, body: { all: true },
  });
  assertOk("FYI and alerts can be marked read", markAction);
  const stillOpen = await prisma.notification.count({
    where: { class: "ACTION_REQUIRED", status: "OPEN" },
  });
  // An action-required row exists exactly as long as its condition does.
  expect("action required is NOT dismissable by hand", stillOpen > 0, true);

  // Resolving by condition: raise a situation, clear it, sweep.
  const requirement = await prisma.collegeRequirement.findFirst({
    where: { status: { in: ["NEW", "UNDER_REVIEW"] }, deletedAt: null },
  });
  if (requirement) {
    const raised = await prisma.notification.findFirst({
      where: { groupKey: "requirements.awaiting_review", status: { not: "RESOLVED" } },
    });
    expect("an open requirement raises its row", raised !== null, true);

    await prisma.collegeRequirement.updateMany({
      where: { status: { in: ["NEW", "UNDER_REVIEW"] }, deletedAt: null },
      data: { status: "REJECTED", rejectionReason: "verification sweep" },
    });
    await fetch(`${BASE}/cron/fee-reminders`, { method: "POST", headers: { "x-cron-secret": secret } });

    const resolved = await prisma.notification.findFirst({
      where: { groupKey: "requirements.awaiting_review", status: { not: "RESOLVED" } },
    });
    // Nobody dismissed it — the condition cleared and the row went.
    expect("clearing the condition resolves the row, unattended", resolved, null);
  }

  const anonBell = await call("/notifications/bell");
  expect("the bell is never public", anonBell.status, 401);

  // ── Rate limiting ───────────────────────────────────────────────────────
  console.log("\n\x1b[1mLogin is rate limited per caller, not just per account\x1b[0m");

  // Per-account lockout stops many guesses at ONE account. This stops many
  // accounts being tried from one source — an attacker spreading attempts
  // across a thousand addresses never trips lockout at all.
  let limited = 0;
  for (let i = 0; i < 45; i++) {
    const res = await call("/auth/login", {
      method: "POST",
      body: { email: `spray-${i}-${Date.now()}@nowhere.test`, password: "x", actor: "ADMIN_USER" },
    });
    if (res.status === 429 && res.body?.error?.code === "RATE_LIMITED") { limited = i + 1; break; }
  }
  expect("spraying distinct accounts is throttled", limited > 0 && limited <= 40, true);

  const stillLimited = await call("/auth/login", {
    method: "POST", body: { email: "priya@gurukulam.test", password: PASSWORD },
  });
  expect("…and the limit holds while the window lasts", stillLimited.status, 429);

  // Clear the throttle we just tripped. Without this the next suite to run —
  // and every one after it inside the window — cannot log in, which would
  // look like a dozen unrelated failures.
  await clearRateLimit();

  console.log(`\n${failed === 0 ? "\x1b[32m" : "\x1b[31m"}${passed} passed, ${failed} failed\x1b[0m\n`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
