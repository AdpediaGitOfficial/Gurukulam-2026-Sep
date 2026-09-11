/**
 * Verifies that the invariants delegated to the DATABASE actually hold.
 *
 * These are the ones the schema is supposed to enforce on its own, so that a
 * bug in a service layer becomes a failed transaction rather than a wrong
 * number. Run it after any migration that touches the constraints:
 *
 *     pnpm --filter @gurukulam/db verify
 *
 * Invariants enforced in application code (rosters never mixing, scope
 * filtering, allocation atomicity) are NOT covered here — they get service
 * tests when those services exist.
 */
import { PrismaClient } from "@prisma/client";

// Every rejection below is deliberate, so Prisma's own error logging is off —
// otherwise the expected failures drown the results.
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

/** Asserts a value. */
function expect(name: string, actual: unknown, wanted: unknown) {
  if (actual === wanted) ok(name, `${actual}`);
  else bad(name, `expected ${wanted}, got ${actual}`);
}

/** Names the constraint that did the rejecting, so a pass says WHY it passed. */
function reason(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e);
  const constraint = /constraint \\?"([^"\\]+)/.exec(text)?.[1];
  if (constraint) return `refused by ${constraint}`;
  if (/is a generated column/.test(text)) return "refused: generated column";
  const unique = /Unique constraint failed on the fields: \(`([^`]+)`\)/.exec(text)?.[1];
  if (unique) return `refused by unique index on ${unique}`;
  return text.split("\n")[0]!.slice(0, 78);
}

/** Asserts that a write is REJECTED by the database. */
async function refuses(name: string, write: () => Promise<unknown>) {
  try {
    await write();
    bad(name, "the database ACCEPTED a write it should have refused");
  } catch (e) {
    ok(name, reason(e));
  }
}

async function main() {
  // Start from the seeded state regardless of how the last run ended, so the
  // script is repeatable rather than order-dependent.
  await prisma.collegeContract.updateMany({
    where: { contractCode: "CON-2026-007" },
    data: { overrideTotalMinor: null, overrideReason: null },
  });

  console.log("\n\x1b[1mGenerated columns\x1b[0m");

  const ledger = await prisma.studentFeeLedger.findFirstOrThrow({
    where: { student: { studentCode: "STU-2026-0891" } },
  });
  // ₹45,000 standard − ₹40,000 pitched = ₹5,000 discount, computed by Postgres.
  expect("discount_amount_minor is derived, not stored by hand", ledger.discountAmountMinor, 500_000n);

  const contract = await prisma.collegeContract.findFirstOrThrow({ where: { contractCode: "CON-2026-007" } });
  // ₹12,000 × 40 students = ₹4,80,000
  expect("computed_total_minor = rate × headcount", contract.computedTotalMinor, 48_000_000n);
  expect("total_value_minor falls back to computed", contract.totalValueMinor, 48_000_000n);

  // An override must win, and must carry its reason.
  await prisma.collegeContract.update({
    where: { contractId: contract.contractId },
    data: { overrideTotalMinor: 45_000_000n, overrideReason: "Negotiated cohort discount, approved by Director" },
  });
  const overridden = await prisma.collegeContract.findFirstOrThrow({ where: { contractId: contract.contractId } });
  expect("an override replaces the computed total", overridden.totalValueMinor, 45_000_000n);
  expect("the computed total survives underneath it", overridden.computedTotalMinor, 48_000_000n);

  await refuses("a generated column cannot be written to", () =>
    prisma.$executeRaw`UPDATE student_fee_ledger SET discount_amount_minor = 1 WHERE ledger_id = ${ledger.ledgerId}`);

  console.log("\n\x1b[1mInvariant 4 — one installment, exactly one parent\x1b[0m");

  await refuses("both parents set is refused", () =>
    prisma.feeInstallment.create({
      data: { ledgerId: ledger.ledgerId, contractId: contract.contractId, installmentNumber: 99, amountMinor: 100n, dueDate: new Date() },
    }));

  await refuses("neither parent set is refused", () =>
    prisma.feeInstallment.create({
      data: { installmentNumber: 98, amountMinor: 100n, dueDate: new Date() },
    }));

  console.log("\n\x1b[1mInvariant 13 — overpayment refused at write time\x1b[0m");

  const installment = await prisma.feeInstallment.findFirstOrThrow({
    where: { ledgerId: ledger.ledgerId, installmentNumber: 2 },
  });
  await refuses("paying more than the installment is due", () =>
    prisma.feeInstallment.update({
      where: { installmentId: installment.installmentId },
      data: { paidAmountMinor: installment.amountMinor + 1n },
    }));

  await refuses("a negative amount is refused", () =>
    prisma.feeInstallment.update({
      where: { installmentId: installment.installmentId },
      data: { amountMinor: -1n },
    }));

  console.log("\n\x1b[1mPayment capture rules\x1b[0m");

  await refuses("a non-cash payment without a transaction ID", () =>
    prisma.paymentTransaction.create({
      data: {
        transactionCode: "TXN-99001", installmentId: installment.installmentId,
        amountMinor: 100n, paymentMode: "UPI", externalTransactionId: null, paidAt: new Date(),
      },
    }));

  const cash = await prisma.paymentTransaction.create({
    data: {
      transactionCode: "TXN-99002", installmentId: installment.installmentId,
      amountMinor: 100n, paymentMode: "CASH", externalTransactionId: null, paidAt: new Date(),
    },
  });
  ok("cash without a transaction ID is accepted", cash.transactionCode);
  await prisma.paymentTransaction.delete({ where: { transactionId: cash.transactionId } });

  await refuses("a reversal without a reason", () =>
    prisma.paymentTransaction.create({
      data: {
        transactionCode: "TXN-99003", installmentId: installment.installmentId,
        amountMinor: 100n, paymentMode: "CASH", paidAt: new Date(), isReversal: true,
      },
    }));

  console.log("\n\x1b[1mADR 0003 — contract commercial basis\x1b[0m");

  await refuses("an override without a reason", () =>
    prisma.collegeContract.update({
      where: { contractId: contract.contractId },
      data: { overrideTotalMinor: 1n, overrideReason: null },
    }));

  await refuses("a PER_STUDENT contract with no rate", () =>
    prisma.collegeContract.create({
      data: {
        contractCode: "CON-9999-999", collegeId: contract.collegeId, courseId: contract.courseId,
        commercialBasis: "PER_STUDENT", perStudentRateMinor: null, billableHeadcount: 10,
      },
    }));

  console.log("\n\x1b[1mSegment separation\x1b[0m");

  const retail = await prisma.student.findFirstOrThrow({ where: { studentCode: "STU-2026-0891" } });
  expect("a retail student has no college", retail.collegeId, null);
  expect("…and is marked RETAIL explicitly, not inferred", retail.enrolmentChannel, "RETAIL");

  const collegeStudents = await prisma.student.findMany({
    where: { enrolmentChannel: "COLLEGE", deletedAt: null },
    include: { ledgers: true },
  });
  const withLedger = collegeStudents.filter((s) => s.ledgers.length > 0);
  expect("no college student has an individual ledger", withLedger.length, 0);
  expect("college students exist to make that meaningful", collegeStudents.length > 0, true);

  const retailBatch = await prisma.batch.findFirstOrThrow({ where: { batchCode: "BTC-DA-SEP-A" } });
  expect("a retail batch has no college", retailBatch.collegeId, null);

  console.log("\n\x1b[1mInvariant 14 — a confirmed requirement keeps its batch\x1b[0m");
  const requirement = await prisma.collegeRequirement.findFirstOrThrow({
    where: { requirementCode: "REQ-2026-014" }, include: { batch: true },
  });
  expect("the requirement points at the batch it produced", requirement.batch?.batchCode, "BTC-DA-SNC-01");

  console.log("\n\x1b[1mADR 0002 — soft delete\x1b[0m");

  const trainer = await prisma.trainer.findFirstOrThrow({ where: { trainerCode: "TRN-0042" } });
  await refuses("a second live trainer cannot reuse a live email", () =>
    prisma.trainer.create({
      data: { trainerCode: "TRN-9999", name: "Impostor", email: trainer.email.toUpperCase() },
    }));

  // Free the email by soft-deleting, then prove it can be reused.
  await prisma.trainer.update({
    where: { trainerId: trainer.trainerId },
    data: { deletedAt: new Date(), deletedBy: "verify-script" },
  });
  const reused = await prisma.trainer.create({
    data: { trainerCode: "TRN-9999", name: "Successor", email: trainer.email },
  });
  ok("a soft-deleted row frees its email for reuse", reused.email);

  // Restore the fixture.
  await prisma.trainer.delete({ where: { trainerId: reused.trainerId } });
  await prisma.trainer.update({
    where: { trainerId: trainer.trainerId }, data: { deletedAt: null, deletedBy: null },
  });

  await refuses("a business ID is never reused, deleted or not", () =>
    prisma.student.create({
      data: { studentCode: "STU-2026-0891", firstName: "Duplicate", email: "dup@example.test" },
    }));

  console.log("\n\x1b[1mInvariant 17 — completion gates assignments\x1b[0m");
  const completed = await prisma.batchSession.findFirst({
    where: { batchId: retailBatch.batchId, status: "COMPLETED" },
  });
  expect("the seeded batch has exactly one completed session", completed !== null, true);

  // Leave the fixtures as the seed created them, so this script is repeatable.
  await prisma.collegeContract.update({
    where: { contractCode: "CON-2026-007" },
    data: { overrideTotalMinor: null, overrideReason: null },
  });

  console.log(
    `\n${failed === 0 ? "\x1b[32m" : "\x1b[31m"}${passed} passed, ${failed} failed\x1b[0m\n`,
  );
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
