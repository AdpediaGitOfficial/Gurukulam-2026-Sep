/**
 * A receipt is issued, not stored — and that is the property under test.
 *
 * Reversal is the only correction a financial record has here; there is no
 * delete anywhere in the ledger module. So a receipt snapshotted at payment
 * would go on claiming money was received after the entry was reversed. Every
 * field is therefore derived at read time, and these checks drive the real
 * endpoint and compare what comes back to the database directly.
 *
 * What is checked:
 *
 *   1. the receipt number IS the generated TXN code, not the typed one
 *   2. the operator's typed reference is carried separately, as somebody
 *      else's reference
 *   3. a retail receipt is addressed to the student
 *   4. a college receipt is addressed to the INSTITUTION — never a student
 *   5. the amount in words matches the figure
 *   6. a reversed receipt says so, naming the entry that reversed it
 *   7. the reversing entry says what it corrects
 *   8. the account figures are today's, read from the parent
 *   9. scope is applied — a regional sub-admin cannot read another city's
 *
 *     npm run verify:receipt --workspace @gurukulam/api
 */
import { PrismaClient } from "@gurukulam/db";
import { fromWire, receiptSchema, rupeesInWords, type Receipt } from "@gurukulam/contracts";
import { clearRateLimit } from "./_rate-limit";

const BASE = process.env.API_URL ?? "http://127.0.0.1:4000/api/v1";
const PASSWORD = "Gurukulam@2026";
const prisma = new PrismaClient();

let passed = 0;
let failed = 0;
const ok = (n: string, d = "") =>
  (passed++, console.log(`  \x1b[32m✓\x1b[0m ${n}${d ? `  \x1b[90m${d}\x1b[0m` : ""}`));
const bad = (n: string, d: string) =>
  (failed++, console.log(`  \x1b[31m✗\x1b[0m ${n}\n      \x1b[31m${d}\x1b[0m`));

async function signIn(email: string): Promise<string> {
  const response = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = (await response.json()) as { tokens?: { accessToken: string } };
  if (!body.tokens) throw new Error(`Could not sign in as ${email}: ${JSON.stringify(body)}`);
  return body.tokens.accessToken;
}

async function receiptFor(token: string, transactionId: string): Promise<Receipt> {
  const response = await fetch(`${BASE}/fee-ledger/payments/${transactionId}/receipt`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const body = await response.json();
  // Parsed against the contract, so a field the API forgets fails here rather
  // than rendering as "undefined" on somebody's printed receipt.
  return receiptSchema.parse(body);
}

async function main() {
  await clearRateLimit();
  const token = await signIn("priya@gurukulam.test");

  try {
    // ── A retail payment, with a typed external reference ───────────────────
    const retail = await prisma.paymentTransaction.findFirstOrThrow({
      where: { deletedAt: null, isReversal: false, receiptNumber: { not: null }, installment: { ledgerId: { not: null } } },
      include: { installment: { include: { ledger: { include: { student: true } } } } },
    });
    const r = await receiptFor(token, retail.transactionId);

    r.receiptNumber === retail.transactionCode
      ? ok("the receipt number is the generated TXN code", r.receiptNumber)
      : bad("the receipt number is the generated TXN code", `got ${r.receiptNumber}, stored ${retail.transactionCode}`);

    r.externalReference === retail.receiptNumber && r.externalReference !== r.receiptNumber
      ? ok("the operator's typed reference is carried separately", `${r.externalReference} ≠ ${r.receiptNumber}`)
      : bad("the operator's typed reference is carried separately",
            `externalReference=${r.externalReference} receiptNumber=${r.receiptNumber}`);

    const student = retail.installment.ledger?.student;
    const expectedName = [student?.firstName, student?.lastName].filter(Boolean).join(" ");
    r.payer.type === "STUDENT" && r.payer.name === expectedName && r.payer.email === student?.email
      ? ok("a retail receipt is addressed to the student", `${r.payer.code} ${r.payer.name}`)
      : bad("a retail receipt is addressed to the student", JSON.stringify(r.payer));

    r.amountInWords === rupeesInWords(fromWire(r.amountMinor))
      ? ok("the amount is stated in words as well as figures", r.amountInWords)
      : bad("the amount is stated in words as well as figures", r.amountInWords);

    // The account figures are TODAY's, read from the parent — not a snapshot.
    const ledger = await prisma.studentFeeLedger.findUniqueOrThrow({
      where: { ledgerId: retail.installment.ledgerId ?? "" },
      select: { totalPaidMinor: true, enrolmentValueMinor: true },
    });
    r.accountPaidMinor === ledger.totalPaidMinor.toString()
      && r.accountTotalMinor === ledger.enrolmentValueMinor.toString()
      ? ok("the account figures are read from the parent now", `${r.accountPaidMinor} of ${r.accountTotalMinor} paise`)
      : bad("the account figures are read from the parent now",
            `receipt ${r.accountPaidMinor}/${r.accountTotalMinor}, ledger ${ledger.totalPaidMinor}/${ledger.enrolmentValueMinor}`);

    // ── A college payment: the institution is billed, never its students ────
    const college = await prisma.paymentTransaction.findFirstOrThrow({
      where: { deletedAt: null, isReversal: false, installment: { contractId: { not: null } } },
      include: { installment: { include: { contract: { include: { college: true } } } } },
    });
    const c = await receiptFor(token, college.transactionId);
    const institution = college.installment.contract?.college;
    c.payer.type === "COLLEGE" && c.payer.name === institution?.name && c.payer.code === institution?.collegeCode
      ? ok("a college receipt is addressed to the institution", `${c.payer.code} ${c.payer.name}`)
      : bad("a college receipt is addressed to the institution", JSON.stringify(c.payer));

    // ── A reversed receipt, and the entry that reversed it ──────────────────
    const contra = await prisma.paymentTransaction.findFirstOrThrow({
      where: { deletedAt: null, isReversal: true, reversesTransactionId: { not: null } },
      select: { transactionId: true, transactionCode: true, reversesTransactionId: true, reversalReason: true },
    });
    const original = await prisma.paymentTransaction.findUniqueOrThrow({
      where: { transactionId: contra.reversesTransactionId ?? "" },
      select: { transactionId: true, transactionCode: true },
    });

    const reversedReceipt = await receiptFor(token, original.transactionId);
    reversedReceipt.kind === "PAYMENT"
      && reversedReceipt.reversedAt !== null
      && reversedReceipt.reversedByReceiptNumber === contra.transactionCode
      ? ok("a reversed receipt says so, naming what reversed it",
           `${reversedReceipt.receiptNumber} reversed by ${reversedReceipt.reversedByReceiptNumber}`)
      : bad("a reversed receipt says so, naming what reversed it", JSON.stringify({
          kind: reversedReceipt.kind,
          reversedAt: reversedReceipt.reversedAt,
          by: reversedReceipt.reversedByReceiptNumber,
        }));

    const contraReceipt = await receiptFor(token, contra.transactionId);
    contraReceipt.kind === "REVERSAL"
      && contraReceipt.reversesReceiptNumber === original.transactionCode
      && contraReceipt.reversalReason === contra.reversalReason
      ? ok("the reversing entry says what it corrects",
           `${contraReceipt.receiptNumber} corrects ${contraReceipt.reversesReceiptNumber}`)
      : bad("the reversing entry says what it corrects", JSON.stringify({
          kind: contraReceipt.kind,
          corrects: contraReceipt.reversesReceiptNumber,
        }));

    // ── Scope: a receipt is not a way around it ─────────────────────────────
    // A regional sub-admin sees one city. Reaching a payment outside it by
    // transaction id has to fail, or a receipt URL is a hole in invariant 11.
    //
    // The seed has no payment outside the regional admin's cities, so the
    // probe makes one, asks for its receipt, and removes it. It is written
    // with Prisma rather than the API deliberately: it never touches the
    // installment's paid amount or the ledger's totals, so there is nothing to
    // restore afterwards and no aggregate is left wrong if this crashes.
    const regional = (await prisma.adminUser.findMany({
      where: { deletedAt: null, accountStatus: "ACTIVE" },
      select: { email: true, cityScope: true },
    })).find((admin) => admin.cityScope.length > 0);

    if (!regional) {
      ok("scope is applied to a receipt", "skipped — no city-scoped admin seeded");
    } else {
      const outsideInstallment = await prisma.feeInstallment.findFirst({
        where: {
          deletedAt: null,
          ledger: { student: { cityId: { notIn: regional.cityScope }, deletedAt: null } },
        },
        select: { installmentId: true },
      });

      if (!outsideInstallment) {
        ok("scope is applied to a receipt", "skipped — no installment outside that city");
      } else {
        const probe = await prisma.paymentTransaction.create({
          data: {
            transactionCode: `TXN-SCOPE-${Date.now()}`,
            installmentId: outsideInstallment.installmentId,
            amountMinor: 100n,
            paymentMode: "CASH",
            paidAt: new Date(),
          },
          select: { transactionId: true },
        });
        try {
          // The global admin can read it — otherwise a 403 below proves nothing.
          const mine = await receiptFor(token, probe.transactionId);
          const scopedToken = await signIn(regional.email);
          const response = await fetch(`${BASE}/fee-ledger/payments/${probe.transactionId}/receipt`, {
            headers: { authorization: `Bearer ${scopedToken}` },
          });
          response.status === 403 || response.status === 404
            ? ok("a receipt outside the caller's city is refused",
                 `global admin reads ${mine.receiptNumber}; the regional admin gets HTTP ${response.status}`)
            : bad("a receipt outside the caller's city is refused",
                  `HTTP ${response.status} — a receipt URL must not be a way around city scope`);
        } finally {
          await prisma.paymentTransaction.delete({ where: { transactionId: probe.transactionId } });
        }
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
