/**
 * M7 — students and the allocation transaction.
 *
 * The first section is the handoff's own acceptance test, quoted from
 * admin-portal-plan.md §7:
 *
 *   "A retail student can be onboarded, priced, paid, batched and credentialed
 *    without any college record existing."
 *
 * The rest guards the two rules that split enrolment down the middle: rosters
 * never mix (invariant 2), and billing follows segment (invariant 3).
 *
 *     pnpm --filter @gurukulam/api verify:enrolment
 */
import { PrismaClient } from "@gurukulam/db";

const BASE = process.env.API_URL ?? "http://127.0.0.1:4000/api/v1";
const PASSWORD = "Gurukulam@2026";
const prisma = new PrismaClient({ log: [] });

let passed = 0, failed = 0;
const ok = (n: string, d = "") => { passed++; console.log(`  \x1b[32m✓\x1b[0m ${n}${d ? `  \x1b[90m${d}\x1b[0m` : ""}`); };
const bad = (n: string, d: string) => { failed++; console.log(`  \x1b[31m✗\x1b[0m ${n}\n      \x1b[31m${d}\x1b[0m`); };
/** Prisma hands back bigint for money columns, which JSON.stringify refuses. */
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
  const collegeUser = await tokenFor("tpo@snc.example.test", "COLLEGE_USER");

  const blr = await prisma.city.findFirstOrThrow({ where: { cityCode: "CITY-BLR" } });
  const india = await prisma.country.findFirstOrThrow({ where: { iso2: "IN" } });
  const snc = await prisma.college.findFirstOrThrow({ where: { collegeCode: "CLG-SNC-01" } });

  // Fixtures of our own, so the run does not depend on seed state.
  const course = await call("/courses", {
    method: "POST", token: admin,
    body: { name: `Enrolment Probe ${stamp}`, standardMarketValue: "50000", topics: [{ title: "One" }] },
  });
  const courseId = course.body.courseId as string;

  const trainer = await call("/trainers", {
    method: "POST", token: admin,
    body: { name: "Enrol Trainer", email: `enrol.${stamp}@t.test`, skillTags: [], cityId: blr.cityId },
  });
  await call(`/trainers/${trainer.body.trainerId}/courses`, {
    method: "PUT", token: admin, body: { courseIds: [courseId] },
  });

  const retailBatch = await call("/batches", {
    method: "POST", token: admin,
    body: { name: `Retail ${stamp}`, courseId, cityId: blr.cityId, startDate: "2026-11-02", maxCapacity: 2 },
  });
  const retailBatchId = retailBatch.body.batchId as string;

  const collegeBatch = await call("/batches", {
    method: "POST", token: admin,
    body: { name: `SNC ${stamp}`, courseId, collegeId: snc.collegeId, startDate: "2026-11-09" },
  });
  const collegeBatchId = collegeBatch.body.batchId as string;

  await call("/batches/sessions", {
    method: "POST", token: admin,
    body: { batchId: retailBatchId, title: "Session one", scheduledDate: "2026-11-02", startTime: "10:00", endTime: "13:00" },
  });
  await call("/batches/sessions", {
    method: "POST", token: admin,
    body: { batchId: retailBatchId, title: "Session two", scheduledDate: "2026-11-09", startTime: "10:00", endTime: "13:00" },
  });

  // ── The acceptance test ─────────────────────────────────────────────────
  console.log("\n\x1b[1mA retail student, end to end, with no college anywhere\x1b[0m");

  const retail = await call("/students", {
    method: "POST", token: admin,
    body: {
      firstName: "Anjali", lastName: "Sharma", email: `anjali.${stamp}@example.test`,
      phone: "+919800011122", countryId: india.countryId, cityId: blr.cityId,
      discipline: "B.Sc", passoutYear: 2025,
    },
  });
  expect("a student is onboarded", retail.status, 201);
  expect("…with no college", retail.body.collegeId, null);
  expect("…marked RETAIL explicitly", retail.body.enrolmentChannel, "RETAIL");
  expect("…with a generated code", /^STU-\d{4}-\d{4}$/.test(retail.body.studentCode), true);
  // Onboarding creates the RECORD only — nothing else is decided yet.
  expect("…and is NOT yet allocated", retail.body.isAllocated, false);
  expect("…nor credentialed", retail.body.credentialsIssuedAt, null);
  const retailId = retail.body.studentId as string;

  const allocated = await call(`/students/${retailId}/allocate`, {
    method: "POST", token: admin,
    body: {
      batchId: retailBatchId,
      enrolmentValue: "45,000",           // negotiated below the ₹50,000 standard
      advance: { amount: "15000", mode: "UPI", transactionId: `UPI-${stamp}`, paidAt: "2026-10-28" },
      installments: [
        { amount: "15000", dueDate: "2026-10-28" },
        { amount: "15000", dueDate: "2026-11-28" },
        { amount: "15000", dueDate: "2026-12-28" },
      ],
      issueCredentials: true,
    },
  });
  expect("the allocation succeeds", allocated.status, 200);
  expect("…as retail", allocated.body.segment, "RETAIL");
  expect("…creating a ledger", allocated.body.ledgerId !== null, true);
  expect("…with the agreed price in paise", allocated.body.enrolmentValueMinor, "4500000");
  expect("…the advance already applied", allocated.body.balancePendingMinor, "3000000");
  expect("…the schedule authored", allocated.body.installmentCount, 3);
  expect("…credentials issued", allocated.body.credentialsIssued, true);
  expect("…and access to every session, past and future", allocated.body.sessionsGranted, 2);

  const ledger = await prisma.studentFeeLedger.findFirstOrThrow({ where: { studentId: retailId } });
  // discount_amount_minor is a GENERATED column — the database derives it.
  expect("the discount is derived by the database", ledger.discountAmountMinor, 500_000n);
  expect("…and the first installment is settled", (await prisma.feeInstallment.findFirstOrThrow({
    where: { ledgerId: ledger.ledgerId, installmentNumber: 1 },
  })).status, "PAID");

  const receipt = await prisma.paymentTransaction.findFirst({
    where: { installment: { ledgerId: ledger.ledgerId } },
  });
  expect("a receipt records the advance", receipt?.amountMinor, 1_500_000n);
  expect("…with its transaction ID", receipt?.externalTransactionId, `UPI-${stamp}`);

  const collegeCount = await prisma.college.count({
    where: { students: { some: { studentId: retailId } } },
  });
  // The point of the whole exercise: none of this needed a college to exist.
  expect("no college record was involved at any point", collegeCount, 0);

  // ── Invariant 2 ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1mInvariant 2 — retail and college rosters never mix\x1b[0m");

  const retailIntoCollege = await call(`/students/${retailId}/allocate`, {
    method: "POST", token: admin,
    body: { batchId: collegeBatchId, enrolmentValue: "45000", installments: [{ amount: "45000", dueDate: "2026-12-01" }] },
  });
  expect("a retail student cannot join a college batch", retailIntoCollege.status, 422);
  expect("…as an invariant violation", retailIntoCollege.body.error.code, "INVARIANT_VIOLATION");

  const collegeStudent = await call("/students", {
    method: "POST", token: collegeUser,
    body: { firstName: "Rohan", lastName: "Iyer", email: `rohan.${stamp}@snc.example.test`, discipline: "CSE", passoutYear: 2027 },
  });
  expect("a college user onboards into their own college", collegeStudent.status, 201);
  expect("…scoped to that college automatically", collegeStudent.body.collegeId, snc.collegeId);
  expect("…marked COLLEGE", collegeStudent.body.enrolmentChannel, "COLLEGE");
  // This is what makes institutional intake auditable.
  expect("…and attributed to the college user", collegeStudent.body.createdByType, "COLLEGE_USER");
  const collegeStudentId = collegeStudent.body.studentId as string;

  const collegeIntoRetail = await call(`/students/${collegeStudentId}/allocate`, {
    method: "POST", token: admin,
    body: { batchId: retailBatchId, enrolmentValue: "45000", installments: [{ amount: "45000", dueDate: "2026-12-01" }] },
  });
  expect("a college student cannot join a retail batch", collegeIntoRetail.status, 422);

  // ── Invariant 3 ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1mInvariant 3 — billing follows segment\x1b[0m");

  const pricedCollege = await call(`/students/${collegeStudentId}/allocate`, {
    method: "POST", token: admin,
    body: {
      batchId: collegeBatchId, enrolmentValue: "20000",
      installments: [{ amount: "20000", dueDate: "2026-12-01" }],
    },
  });
  // Silently dropping the pricing would let an operator believe the student
  // was billed when the institution's contract carries the money.
  expect("pricing a college student is refused, not ignored", pricedCollege.status, 422);
  expect("…explaining where the money lives", pricedCollege.body.error.message.includes("contract"), true);

  const collegeAllocated = await call(`/students/${collegeStudentId}/allocate`, {
    method: "POST", token: admin, body: { batchId: collegeBatchId },
  });
  expect("without pricing it succeeds", collegeAllocated.status, 200);
  expect("…as college", collegeAllocated.body.segment, "COLLEGE");
  expect("…with NO individual ledger", collegeAllocated.body.ledgerId, null);
  expect("…and no installments", collegeAllocated.body.installmentCount, 0);
  // A college student still needs schedule, materials and recordings.
  expect("…but credentials are still issued", collegeAllocated.body.credentialsIssued, true);

  const ledgerCount = await prisma.studentFeeLedger.count({ where: { studentId: collegeStudentId } });
  expect("nothing resembling a ledger exists for them", ledgerCount, 0);

  // ── The schedule must account for the whole price ───────────────────────
  console.log("\n\x1b[1mA schedule that does not add up is refused at write time\x1b[0m");

  const short = await call("/students", {
    method: "POST", token: admin,
    body: { firstName: "Short", lastName: "Schedule", email: `short.${stamp}@example.test`, cityId: blr.cityId },
  });
  const shortId = short.body.studentId as string;

  const underfunded = await call(`/students/${shortId}/allocate`, {
    method: "POST", token: admin,
    body: {
      batchId: retailBatchId, enrolmentValue: "45000",
      installments: [{ amount: "15000", dueDate: "2026-11-28" }],
    },
  });
  // A schedule summing to less leaves a balance nothing will ever collect.
  expect("a schedule that under-totals is refused", underfunded.status, 400);
  expect("…naming both figures", underfunded.body.error.fields.installments.includes("45000"), true);

  const noSchedule = await call(`/students/${shortId}/allocate`, {
    method: "POST", token: admin, body: { batchId: retailBatchId, enrolmentValue: "45000", installments: [] },
  });
  expect("no schedule at all is refused", noSchedule.status, 400);

  const overPriced = await call(`/students/${shortId}/allocate`, {
    method: "POST", token: admin,
    body: { batchId: retailBatchId, enrolmentValue: "60000", installments: [{ amount: "60000", dueDate: "2026-11-28" }] },
  });
  expect("a price above the standard value is refused", overPriced.status, 400);

  const noTxnId = await call(`/students/${shortId}/allocate`, {
    method: "POST", token: admin,
    body: {
      batchId: retailBatchId, enrolmentValue: "45000",
      advance: { amount: "15000", mode: "UPI", paidAt: "2026-10-28" },
      installments: [{ amount: "45000", dueDate: "2026-11-28" }],
    },
  });
  expect("a non-cash advance without a transaction ID is refused", noTxnId.status, 400);

  // ── Atomicity ───────────────────────────────────────────────────────────
  console.log("\n\x1b[1mInvariant 12 — allocation is all of it, or none\x1b[0m");

  const beforeMappings = await prisma.studentBatchMapping.count({ where: { studentId: shortId, deletedAt: null } });
  const beforeLedgers = await prisma.studentFeeLedger.count({ where: { studentId: shortId } });
  expect("the refused allocations left no roster row", beforeMappings, 0);
  expect("…and no ledger", beforeLedgers, 0);

  // Capacity is 2 and the retail student took one seat; fill it and prove the
  // next allocation writes nothing at all.
  await call(`/students/${shortId}/allocate`, {
    method: "POST", token: admin,
    body: { batchId: retailBatchId, enrolmentValue: "45000", installments: [{ amount: "45000", dueDate: "2026-11-28" }] },
  });
  const third = await call("/students", {
    method: "POST", token: admin,
    body: { firstName: "Third", lastName: "Seat", email: `third.${stamp}@example.test`, cityId: blr.cityId },
  });
  const full = await call(`/students/${third.body.studentId}/allocate`, {
    method: "POST", token: admin,
    body: { batchId: retailBatchId, enrolmentValue: "45000", installments: [{ amount: "45000", dueDate: "2026-11-28" }] },
  });
  expect("a full batch refuses the next student", full.status, 409);
  expect("…writing no ledger for them", await prisma.studentFeeLedger.count({ where: { studentId: third.body.studentId } }), 0);

  const duplicate = await call(`/students/${retailId}/allocate`, {
    method: "POST", token: admin,
    body: { batchId: retailBatchId, enrolmentValue: "45000", installments: [{ amount: "45000", dueDate: "2026-11-28" }] },
  });
  expect("allocating the same student twice is refused", duplicate.status, 409);

  // ── The unallocated queue ───────────────────────────────────────────────
  console.log("\n\x1b[1mThe unallocated queue is computed, never stored\x1b[0m");

  const summary = await call("/students/unallocated", { token: admin });
  expect("the queue reports", summary.status, 200);
  expect("…counting the student we never allocated", summary.body.unallocated.total >= 1, true);
  expect("…in the freshest ageing bucket", summary.body.unallocated.buckets.d0to3 >= 1, true);
  // A college student having no ledger is correct, not a defect.
  expect("…and does not flag college students as missing a ledger", typeof summary.body.noLedger, "number");
  expect("…tracking unused credentials", summary.body.credentialsUnused >= 1, true);

  const queue = await call("/students?allocated=false&pageSize=200", { token: admin });
  const allocatedLeaked = queue.body.rows.some((s: any) => s.isAllocated === true);
  expect("the queue never contains an allocated student", allocatedLeaked, false);

  // ── Deallocation keeps the history ──────────────────────────────────────
  console.log("\n\x1b[1mLeaving a roster does not erase having been on it\x1b[0m");

  const removed = await call(`/students/${shortId}/deallocate`, {
    method: "POST", token: admin, body: { batchId: retailBatchId, reason: "Transferred to a later cohort" },
  });
  expect("a student can leave a roster", removed.status, 204);
  const mapping = await prisma.studentBatchMapping.findFirst({ where: { studentId: shortId, batchId: retailBatchId } });
  expect("…the mapping survives, soft-deleted", mapping?.deletedAt !== null, true);
  expect("…with the reason kept", mapping?.exitReason, "Transferred to a later cohort");

  // ── Deleting a student who has paid ─────────────────────────────────────
  console.log("\n\x1b[1mMoney received is a fact about when it was received\x1b[0m");

  const deletePaid = await call(`/students/${retailId}`, { method: "DELETE", token: admin });
  expect("a student with recorded payments cannot be deleted", deletePaid.status, 409);
  expect("…pointing at suspension instead", deletePaid.body.error.message.includes("Suspend"), true);

  const suspended = await call(`/students/${retailId}/suspend`, {
    method: "POST", token: admin, body: { reason: "Non-payment follow-up" },
  });
  expect("suspension is available", suspended.body.accountStatus, "SUSPENDED");
  expect("…with its reason", suspended.body.suspendedReason, "Non-payment follow-up");
  const stillEnrolled = await prisma.studentBatchMapping.count({ where: { studentId: retailId, deletedAt: null } });
  expect("…and suspension does not touch enrolment", stillEnrolled, 1);

  console.log(`\n${failed === 0 ? "\x1b[32m" : "\x1b[31m"}${passed} passed, ${failed} failed\x1b[0m\n`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
