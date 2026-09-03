/**
 * M11 — the executive dashboard.
 *
 * A dashboard is the easiest place in the system to leak another region's
 * data, precisely because it feels like "just numbers": there is no record on
 * screen that looks wrong, only a total that is quietly too large.
 * architecture.md §7 says a cached figure must be scope-derived or one
 * region's numbers appear in another's — so most of this file is about
 * proving each aggregate is scoped, one at a time.
 *
 *     pnpm --filter @gurukulam/api verify:dashboard
 */
import { PrismaClient } from "@gurukulam/db";

const BASE = process.env.API_URL ?? "http://127.0.0.1:4000/api/v1";
const PASSWORD = "Gurukulam@2026";
const prisma = new PrismaClient({ log: [] });

let passed = 0, failed = 0;
const ok = (n: string, d = "") => { passed++; console.log(`  \x1b[32m✓\x1b[0m ${n}${d ? `  \x1b[90m${d}\x1b[0m` : ""}`); };
const bad = (n: string, d: string) => { failed++; console.log(`  \x1b[31m✗\x1b[0m ${n}\n      \x1b[31m${d}\x1b[0m`); };
const show = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? `${x}n` : x));
function expect(name: string, actual: unknown, wanted: unknown) {
  const a = show(actual), w = show(wanted);
  if (a === w) ok(name, String(a)); else bad(name, `expected ${w}, got ${a}`);
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
async function tokenFor(email: string, actor = "ADMIN_USER"): Promise<string> {
  const r = await call("/auth/login", { method: "POST", body: { email, password: PASSWORD, actor } });
  if (r.status !== 200) throw new Error(`login failed for ${email}`);
  return r.body.tokens.accessToken;
}

const stamp = Date.now();

async function main() {
  const admin = await tokenFor("priya@gurukulam.test");
  const regional = await tokenFor("arun@gurukulam.test");     // Bengaluru only
  const collegeUser = await tokenFor("tpo@snc.example.test", "COLLEGE_USER"); // SNC only

  const blr = await prisma.city.findFirstOrThrow({ where: { cityCode: "CITY-BLR" } });
  const hyd = await prisma.city.findFirstOrThrow({ where: { cityCode: "CITY-HYD" } });
  const snc = await prisma.college.findFirstOrThrow({ where: { collegeCode: "CLG-SNC-01" } });

  // A distinctly-Hyderabad fixture, so a Bengaluru operator seeing it is
  // unambiguous rather than a coincidence of counts.
  const course = await call("/courses", {
    method: "POST", token: admin,
    body: { name: `Dash Probe ${stamp}`, standardMarketValue: "20000", topics: [{ title: "One" }] },
  });
  const courseId = course.body.courseId as string;

  const hydBatch = await call("/batches", {
    method: "POST", token: admin,
    body: { name: `HYD only ${stamp}`, courseId, cityId: hyd.cityId, startDate: "2026-12-01" },
  });
  const hydStudent = await call("/students", {
    method: "POST", token: admin,
    body: { firstName: "Hyd", lastName: `Only${stamp}`, email: `hyd.${stamp}@example.test`, cityId: hyd.cityId },
  });
  await call(`/students/${hydStudent.body.studentId}/allocate`, {
    method: "POST", token: admin,
    body: { batchId: hydBatch.body.batchId, enrolmentValue: "20000", installments: [{ amount: "20000", dueDate: "2027-01-15" }] },
  });

  // ── It renders ──────────────────────────────────────────────────────────
  console.log("\n\x1b[1mThe dashboard aggregates over everything\x1b[0m");

  const global = await call("/dashboard", { token: admin });
  expect("a global admin gets a dashboard", global.status, 200);
  expect("…with four headline counts", Object.keys(global.body.headline).sort(), ["colleges", "questionBank", "students", "trainers"]);
  expect("…and four action queues", Object.keys(global.body.actions).sort(), ["certificatesAwaitingApproval", "overdueInstallments", "sessionsMissingRecordings", "unallocatedStudents"]);
  expect("…labelled as global", global.body.scope.label, "All regions");
  expect("…with a null city scope", global.body.scope.cityIds, null);

  // ── Segmentation ────────────────────────────────────────────────────────
  console.log("\n\x1b[1mEvery figure is split retail vs college\x1b[0m");

  const h = global.body.headline.students;
  expect("student counts add up", h.retail + h.college, h.total);
  expect("…with both segments present", h.retail > 0 && h.college > 0, true);

  const c = global.body.collections;
  // A blended number hides both halves, so the split is the point.
  expect("billed splits by who is billed", BigInt(c.billed.retail) + BigInt(c.billed.college), BigInt(c.billed.total));
  expect("collected splits too", BigInt(c.collected.retail) + BigInt(c.collected.college), BigInt(c.collected.total));
  expect("retail is billed through ledgers", BigInt(c.billed.retail) > 0n, true);
  expect("college is billed through contracts", BigInt(c.billed.college) > 0n, true);

  const d = global.body.delivery;
  expect("active batches split", d.activeBatches.retail + d.activeBatches.college, d.activeBatches.total);
  expect("certificates split", d.certificatesIssued.retail + d.certificatesIssued.college, d.certificatesIssued.total);

  // ── City scope, aggregate by aggregate ──────────────────────────────────
  console.log("\n\x1b[1mCity scope reaches every aggregate, not just the first\x1b[0m");

  const region = await call("/dashboard", { token: regional });
  expect("a scoped admin gets a dashboard", region.status, 200);
  expect("…labelled with its scope", region.body.scope.label, "1 region");
  expect("…echoing exactly which", region.body.scope.cityIds, [blr.cityId]);

  expect("headline students are fewer than global", region.body.headline.students.total < global.body.headline.students.total, true);
  expect("…trainers too", region.body.headline.trainers <= global.body.headline.trainers, true);
  expect("…and colleges", region.body.headline.colleges <= global.body.headline.colleges, true);

  // The catalogue is not regional, so this figure is deliberately global.
  expect("the question bank is NOT city-scoped, by design", region.body.headline.questionBank, global.body.headline.questionBank);

  expect("unallocated students are scoped", region.body.actions.unallocatedStudents <= global.body.actions.unallocatedStudents, true);
  expect("overdue installments are scoped", region.body.actions.overdueInstallments <= global.body.actions.overdueInstallments, true);
  expect("missing recordings are scoped", region.body.actions.sessionsMissingRecordings <= global.body.actions.sessionsMissingRecordings, true);
  expect("certificates awaiting approval are scoped", region.body.actions.certificatesAwaitingApproval <= global.body.actions.certificatesAwaitingApproval, true);

  expect("billed money is scoped", BigInt(region.body.collections.billed.total) < BigInt(global.body.collections.billed.total), true);
  expect("outstanding is scoped", BigInt(region.body.collections.outstanding.total) <= BigInt(global.body.collections.outstanding.total), true);
  expect("active batches are scoped", region.body.delivery.activeBatches.total < global.body.delivery.activeBatches.total, true);

  // The specific leak, named: the Hyderabad course must not appear at all.
  const regionalCourseIds = region.body.topCourses.map((c: any) => c.courseId);
  expect("a Hyderabad-only course is absent from a Bengaluru dashboard", regionalCourseIds.includes(courseId), false);
  const globalCourseIds = global.body.topCourses.map((c: any) => c.courseId);
  expect("…while a global admin can see it", globalCourseIds.includes(courseId) || global.body.topCourses.length >= 10, true);

  const regionalTrainerIds = region.body.trainerLoad.map((t: any) => t.trainerId);
  const hydTrainers = await prisma.trainer.findMany({
    where: { cityId: hyd.cityId, deletedAt: null }, select: { trainerId: true },
  });
  const leakedTrainer = hydTrainers.some((t) => regionalTrainerIds.includes(t.trainerId));
  expect("no Hyderabad trainer appears in a Bengaluru dashboard", leakedTrainer, false);

  // ── College scope ───────────────────────────────────────────────────────
  console.log("\n\x1b[1mA college user sees only their own institution\x1b[0m");

  const collegeView = await call("/dashboard", { token: collegeUser });
  expect("a college user gets a dashboard", collegeView.status, 200);
  expect("…labelled as their college", collegeView.body.scope.label, "This college only");
  expect("…echoing which", collegeView.body.scope.collegeId, snc.collegeId);
  expect("…counting exactly one college", collegeView.body.headline.colleges, 1);

  // A college's students are all COLLEGE by definition; a retail student
  // appearing here would be someone else's entirely.
  expect("no retail students appear", collegeView.body.headline.students.retail, 0);
  expect("…and their own do", collegeView.body.headline.students.college > 0, true);
  expect("no retail money appears", collegeView.body.collections.billed.retail, "0");
  expect("no retail batches appear", collegeView.body.delivery.activeBatches.retail, 0);

  const collegeStudents = await prisma.student.count({
    where: { collegeId: snc.collegeId, deletedAt: null },
  });
  expect("the count matches their real roster", collegeView.body.headline.students.total, collegeStudents);

  // ── Figures are true, not merely scoped ─────────────────────────────────
  console.log("\n\x1b[1mThe numbers match what the modules would report\x1b[0m");

  const realUnallocated = await prisma.student.count({
    where: { deletedAt: null, batchMappings: { none: { deletedAt: null } } },
  });
  expect("unallocated matches a direct count", global.body.actions.unallocatedStudents, realUnallocated);

  const realOverdue = await prisma.feeInstallment.count({ where: { deletedAt: null, status: "OVERDUE" } });
  expect("overdue matches a direct count", global.body.actions.overdueInstallments, realOverdue);

  const realMissing = await prisma.batchSession.count({
    where: { deletedAt: null, status: "COMPLETED", recording: null },
  });
  expect("missing recordings matches a direct count", global.body.actions.sessionsMissingRecordings, realMissing);

  const queue = await call("/students/unallocated", { token: admin });
  // Two modules, one truth — a dashboard that disagrees with the queue it
  // links to is worse than no dashboard.
  expect("the dashboard agrees with the unallocated queue", global.body.actions.unallocatedStudents, queue.body.unallocated.total);

  const certQueue = await prisma.certificateSubmissionRow.count({
    where: { deletedAt: null, status: "PENDING", submission: { deletedAt: null, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } },
  });
  expect("certificates awaiting approval matches", global.body.actions.certificatesAwaitingApproval, certQueue);

  // ── Permission gate ─────────────────────────────────────────────────────
  console.log("\n\x1b[1mThe dashboard is behind its own permission\x1b[0m");

  const role = await prisma.role.findFirstOrThrow({ where: { name: "Regional Sub-Admin" } });
  const original = role.permissions;
  await prisma.role.update({
    where: { roleId: role.roleId },
    data: { permissions: { ...(original as object), dashboard: { read: false, edit: false, delete: false } } },
  });
  const denied = await call("/dashboard", { token: regional });
  expect("revoking dashboard read denies it", denied.status, 403);
  await prisma.role.update({ where: { roleId: role.roleId }, data: { permissions: original as object } });

  const anon = await call("/dashboard");
  expect("and it is never public", anon.status, 401);

  console.log(`\n${failed === 0 ? "\x1b[32m" : "\x1b[31m"}${passed} passed, ${failed} failed\x1b[0m\n`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
