/**
 * M8 — the fee ledger, college contracts and the payment engine they share.
 *
 * The assertions here are the ones a finance team would notice being wrong,
 * and the ones a demo would not: an overpayment accepted then corrected, a
 * total that silently restates itself, a reminder addressed to the wrong
 * party.
 *
 *     pnpm --filter @gurukulam/api verify:money
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
async function call<T = any>(path: string, init: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> } = {}): Promise<Res<T>> {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      ...(init.headers ?? {}),
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
  const blr = await prisma.city.findFirstOrThrow({ where: { cityCode: "CITY-BLR" } });
  const snc = await prisma.college.findFirstOrThrow({ where: { collegeCode: "CLG-SNC-01" } });

  const course = await call("/courses", {
    method: "POST", token: admin,
    body: { name: `Money Probe ${stamp}`, standardMarketValue: "60000", topics: [{ title: "One" }] },
  });
  const courseId = course.body.courseId as string;

  const batch = await call("/batches", {
    method: "POST", token: admin,
    body: { name: `Money batch ${stamp}`, courseId, cityId: blr.cityId, startDate: "2026-11-02" },
  });
  const student = await call("/students", {
    method: "POST", token: admin,
    body: { firstName: "Vikram", lastName: "Rao", email: `vikram.${stamp}@example.test`, cityId: blr.cityId },
  });
  const studentId = student.body.studentId as string;

  const allocated = await call(`/students/${studentId}/allocate`, {
    method: "POST", token: admin,
    body: {
      batchId: batch.body.batchId, enrolmentValue: "60000",
      installments: [
        { amount: "20000", dueDate: "2026-11-10" },
        { amount: "20000", dueDate: "2026-12-10" },
        { amount: "20000", dueDate: "2027-01-10" },
      ],
    },
  });
  const ledgerId = allocated.body.ledgerId as string;

  // ── The register ────────────────────────────────────────────────────────
  console.log("\n\x1b[1mThe register is a summary; the schedule lives in the ledger\x1b[0m");

  const detail = await call(`/fee-ledger/${ledgerId}`, { token: admin });
  expect("the ledger opens", detail.status, 200);
  expect("…with the whole schedule", detail.body.installments.length, 3);
  expect("…none paid yet", detail.body.installmentsPaid, 0);
  expect("…and the discount derived by the database", detail.body.discountAmountMinor, "0");
  expect("…outstanding derived per row, not stored", detail.body.installments[0].outstandingMinor, "2000000");
  expect("…with the next due date surfaced", detail.body.nextDueDate, "2026-11-10");

  const first = detail.body.installments[0];

  // ── Invariant 13 ────────────────────────────────────────────────────────
  console.log("\n\x1b[1mInvariant 13 — overpayment is refused at write time\x1b[0m");

  const tooMuch = await call("/fee-ledger/payments", {
    method: "POST", token: admin,
    body: { installmentId: first.installmentId, amount: "25000", mode: "UPI", transactionId: `T-${stamp}-a`, paidAt: "2026-11-09" },
  });
  // Refused, not accepted-and-corrected: a corrected overpayment leaves a
  // reversal in the register that never had to exist.
  expect("paying more than is due is refused", tooMuch.status, 400);
  expect("…naming what is actually outstanding", tooMuch.body.error.fields.amount.includes("20000"), true);

  const noTxn = await call("/fee-ledger/payments", {
    method: "POST", token: admin,
    body: { installmentId: first.installmentId, amount: "20000", mode: "UPI", paidAt: "2026-11-09" },
  });
  expect("a non-cash payment without a transaction ID is refused", noTxn.status, 400);

  const zero = await call("/fee-ledger/payments", {
    method: "POST", token: admin,
    body: { installmentId: first.installmentId, amount: "0", mode: "CASH", paidAt: "2026-11-09" },
  });
  expect("a zero payment is refused", zero.status, 400);

  // ── Recording ───────────────────────────────────────────────────────────
  console.log("\n\x1b[1mA payment moves the receipt, the installment and the parent together\x1b[0m");

  const part = await call("/fee-ledger/payments", {
    method: "POST", token: admin,
    body: { installmentId: first.installmentId, amount: "8000", mode: "UPI", transactionId: `T-${stamp}-b`, paidAt: "2026-11-09" },
  });
  expect("a partial payment is recorded", part.status, 201);
  expect("…with a generated receipt code", /^TXN-\d{5}$/.test(part.body.transactionCode), true);

  const afterPart = await call(`/fee-ledger/${ledgerId}`, { token: admin });
  expect("the installment is PARTIALLY_PAID", afterPart.body.installments[0].status, "PARTIALLY_PAID");
  expect("…its outstanding recomputed", afterPart.body.installments[0].outstandingMinor, "1200000");
  // The parent moves in the same transaction — a receipt against a balance
  // that never changed is the failure this prevents.
  expect("the ledger total moved with it", afterPart.body.totalPaidMinor, "800000");
  expect("…and its balance", afterPart.body.balancePendingMinor, "5200000");
  expect("…and its status re-derived", afterPart.body.status, "PARTIALLY_PAID");

  const settle = await call("/fee-ledger/payments", {
    method: "POST", token: admin,
    body: { installmentId: first.installmentId, amount: "12000", mode: "CASH", paidAt: "2026-11-09" },
  });
  expect("cash needs no transaction ID", settle.status, 201);

  const afterSettle = await call(`/fee-ledger/${ledgerId}`, { token: admin });
  expect("the installment settles exactly", afterSettle.body.installments[0].status, "PAID");
  expect("…and cannot be paid again", (await call("/fee-ledger/payments", {
    method: "POST", token: admin,
    body: { installmentId: first.installmentId, amount: "100", mode: "CASH", paidAt: "2026-11-09" },
  })).status, 409);
  expect("the register shows 1 of 3", `${afterSettle.body.installmentsPaid}/${afterSettle.body.installmentsTotal}`, "1/3");

  // ── Reversal, not deletion ──────────────────────────────────────────────
  console.log("\n\x1b[1mA receipt is never deleted — the correction is a reversing entry\x1b[0m");

  const reversal = await call(`/fee-ledger/payments/${settle.body.transactionId}/reverse`, {
    method: "POST", token: admin, body: { reason: "Cash never reached the account" },
  });
  expect("a receipt can be reversed", reversal.status, 201);
  expect("…flagged as a reversal", reversal.body.isReversal, true);
  expect("…pointing at what it reverses", reversal.body.reversesTransactionId, settle.body.transactionId);

  const original = await prisma.paymentTransaction.findUnique({ where: { transactionId: settle.body.transactionId } });
  // The original survives. That is the entire point of a reversing entry.
  expect("the original receipt still exists", original !== null, true);
  expect("…and is not soft-deleted either", original?.deletedAt, null);

  const afterReversal = await call(`/fee-ledger/${ledgerId}`, { token: admin });
  expect("the installment falls back to PARTIALLY_PAID", afterReversal.body.installments[0].status, "PARTIALLY_PAID");
  expect("…and the ledger total unwinds", afterReversal.body.totalPaidMinor, "800000");

  const doubleReverse = await call(`/fee-ledger/payments/${settle.body.transactionId}/reverse`, {
    method: "POST", token: admin, body: { reason: "again" },
  });
  expect("the same receipt cannot be reversed twice", doubleReverse.status, 409);

  const reverseAReversal = await call(`/fee-ledger/payments/${reversal.body.transactionId}/reverse`, {
    method: "POST", token: admin, body: { reason: "no" },
  });
  expect("a reversal cannot itself be reversed", reverseAReversal.status, 409);

  // ── Invariant 6 ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1mInvariant 6 — the recipient resolves from the installment's parent\x1b[0m");

  const studentRecipient = await call(`/fee-ledger/installments/${first.installmentId}/recipient`, { token: admin });
  expect("a retail installment reaches the STUDENT", studentRecipient.body.recipientType, "STUDENT");
  expect("…at their own address", studentRecipient.body.email, `vikram.${stamp}@example.test`);

  // ── Contracts (ADR 0003) ────────────────────────────────────────────────
  console.log("\n\x1b[1mA contract stores both commercial bases\x1b[0m");

  const perStudent = await call("/fee-ledger/contracts", {
    method: "POST", token: admin,
    body: {
      collegeId: snc.collegeId, courseId, commercialBasis: "PER_STUDENT",
      perStudentRate: "12000", billableHeadcount: 40, headcountBasis: "REQUIREMENT",
    },
  });
  expect("a per-student contract is created", perStudent.status, 201);
  expect("…with a generated code", /^CON-\d{4}-\d{3}$/.test(perStudent.body.contractCode), true);
  // Neither total was written by the API — Postgres derived both.
  expect("…its total computed by the database", perStudent.body.computedTotalMinor, "48000000");
  expect("…and that is what it bills", perStudent.body.totalValueMinor, "48000000");
  expect("…recording which headcount figure", perStudent.body.headcountBasis, "REQUIREMENT");
  const contractId = perStudent.body.contractId as string;

  const missingRate = await call("/fee-ledger/contracts", {
    method: "POST", token: admin,
    body: { collegeId: snc.collegeId, courseId, commercialBasis: "PER_STUDENT", billableHeadcount: 10 },
  });
  expect("a per-student contract without a rate is refused", missingRate.status, 400);

  const flat = await call("/fee-ledger/contracts", {
    method: "POST", token: admin,
    body: { collegeId: snc.collegeId, courseId, commercialBasis: "FLAT_COHORT", flatCohortPrice: "350000" },
  });
  expect("a flat cohort contract is created", flat.status, 201);
  expect("…totalling the flat price", flat.body.totalValueMinor, "35000000");

  const unexplained = await call("/fee-ledger/contracts", {
    method: "POST", token: admin,
    body: {
      collegeId: snc.collegeId, courseId, commercialBasis: "FLAT_COHORT",
      flatCohortPrice: "350000", overrideTotal: "300000",
    },
  });
  // An unexplained discount is the first thing an audit asks about.
  expect("an override without a reason is refused", unexplained.status, 400);

  const overridden = await call(`/fee-ledger/contracts/${contractId}`, {
    method: "PATCH", token: admin,
    body: { overrideTotal: "450000", overrideReason: "Negotiated cohort discount, approved by Director" },
  });
  expect("an override replaces the billed total", overridden.body.totalValueMinor, "45000000");
  expect("…while the computed total survives underneath", overridden.body.computedTotalMinor, "48000000");

  // ── One engine, two parents ─────────────────────────────────────────────
  console.log("\n\x1b[1mInvariant 4 — one schedule engine, two parents\x1b[0m");

  const wrongTotal = await call(`/fee-ledger/contracts/${contractId}/schedule`, {
    method: "PUT", token: admin,
    body: { installments: [{ amount: "100000", dueDate: "2026-12-01" }] },
  });
  expect("a contract schedule that under-totals is refused", wrongTotal.status, 400);

  const schedule = await call(`/fee-ledger/contracts/${contractId}/schedule`, {
    method: "PUT", token: admin,
    body: {
      installments: [
        { amount: "150000", dueDate: "2026-12-01" },
        { amount: "150000", dueDate: "2027-01-01" },
        { amount: "150000", dueDate: "2027-02-01" },
      ],
    },
  });
  assertOk("a contract takes the same schedule shape", schedule);
  expect("…with three rows", schedule.body.length, 3);
  expect("…hanging off the contract", schedule.body[0].contractId, contractId);
  expect("…and NOT off a ledger", schedule.body[0].ledgerId, null);

  const dbRow = await prisma.feeInstallment.findFirstOrThrow({ where: { installmentId: schedule.body[0].installmentId } });
  expect("exactly one parent is set in the database", (dbRow.ledgerId === null) !== (dbRow.contractId === null), true);

  const collegeRecipient = await call(`/fee-ledger/installments/${schedule.body[0].installmentId}/recipient`, { token: admin });
  // The failure this prevents by construction: a college's student receiving
  // an invoice reminder that is not theirs.
  expect("a contract installment reaches the COLLEGE", collegeRecipient.body.recipientType, "COLLEGE");
  expect("…named as the institution", collegeRecipient.body.name, snc.name);
  expect("…at its own contact address, not a student's", collegeRecipient.body.email.endsWith("snc.example.test"), true);

  // ── Contract payments ───────────────────────────────────────────────────
  console.log("\n\x1b[1mThe same payment engine serves both parents\x1b[0m");

  const collegePayment = await call("/fee-ledger/payments", {
    method: "POST", token: admin,
    body: {
      installmentId: schedule.body[0].installmentId, amount: "150000", mode: "OTHER",
      transactionId: `NEFT-${stamp}`, paidAt: "2026-12-01", bankOrHandle: "SNC Trust · HDFC",
    },
  });
  expect("a contract installment takes a payment", collegePayment.status, 201);

  const contractAfter = await call(`/fee-ledger/contracts/${contractId}`, { token: admin });
  expect("the contract's total paid moves", contractAfter.body.totalPaidMinor, "15000000");
  expect("…and its balance against the OVERRIDDEN total", contractAfter.body.balancePendingMinor, "30000000");
  // A payment against a DRAFT contract activates it: money arriving is the
  // strongest signal it is no longer a draft, and leaving it DRAFT would show
  // a paying contract as unsigned in the register.
  expect("…and a payment activates the draft", contractAfter.body.status, "ACTIVE");

  const restate = await call(`/fee-ledger/contracts/${contractId}`, {
    method: "PATCH", token: admin, body: { billableHeadcount: 30 },
  });
  // Restating a total after collection changes what the college already
  // agreed to pay.
  expect("commercial terms cannot be restated after collection", restate.status, 409);

  const deleteCollected = await call(`/fee-ledger/contracts/${contractId}`, { method: "DELETE", token: admin });
  expect("a contract with collections cannot be deleted", deleteCollected.status, 409);

  // ── The nightly run ─────────────────────────────────────────────────────
  console.log("\n\x1b[1mThe nightly run is behind a shared secret\x1b[0m");

  const noSecret = await call("/cron/fee-reminders", { method: "POST" });
  expect("the cron endpoint refuses an unauthenticated call", noSecret.status, 401);

  const wrongSecret = await call("/cron/fee-reminders", { method: "POST", headers: { "x-cron-secret": "nope" } });
  expect("…and a wrong secret", wrongSecret.status, 401);

  const run = await call("/cron/fee-reminders", {
    method: "POST", headers: { "x-cron-secret": process.env.CRON_SHARED_SECRET ?? "local-dev-cron-secret" },
  });
  expect("with the right secret it runs", run.status, 200);
  expect("…reporting what it did", typeof run.body.markedOverdue, "number");

  // Everything in this run is dated 2026-11 onward and "today" is earlier, so
  // nothing should have been marked overdue by it.
  const overdueNow = await prisma.feeInstallment.count({
    where: { ledgerId, deletedAt: null, status: "OVERDUE" },
  });
  expect("future installments are not marked overdue", overdueNow, 0);

  // A due date in the past must be caught on the next run.
  await prisma.feeInstallment.updateMany({
    where: { ledgerId, installmentNumber: 2 },
    data: { dueDate: new Date("2020-01-01T00:00:00Z") },
  });
  const secondRun = await call("/cron/fee-reminders", {
    method: "POST", headers: { "x-cron-secret": process.env.CRON_SHARED_SECRET ?? "local-dev-cron-secret" },
  });
  expect("a past-due installment is caught", secondRun.body.markedOverdue >= 1, true);

  const ledgerAfterCron = await call(`/fee-ledger/${ledgerId}`, { token: admin });
  // Ledger status is derived from its installments, never set directly.
  expect("…and the parent's status re-derives to OVERDUE", ledgerAfterCron.body.status, "OVERDUE");
  expect("…with the overdue count surfaced", ledgerAfterCron.body.overdueCount >= 1, true);

  console.log(`\n${failed === 0 ? "\x1b[32m" : "\x1b[31m"}${passed} passed, ${failed} failed\x1b[0m\n`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
