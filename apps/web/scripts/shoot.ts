/**
 * Screenshots of the screens built in this run, from the RUNNING app.
 *
 * Not mockups. Every image here is the real console rendering real seeded
 * data, which is the only kind of picture worth showing — a mock can promise
 * a screen that does not exist, and that is the thing this whole run has been
 * about catching.
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { PrismaClient } from "@gurukulam/db";

const BASE = process.env["BASE"] ?? "http://127.0.0.1:3000";
const EXECUTABLE = process.env["CHROMIUM_PATH"] ?? process.env["CHROME"];
const OUT = process.env["SHOT_DIR"] ?? "/tmp/shots";
const EMAIL = "priya@gurukulam.test";
const PASSWORD = "Gurukulam@2026";

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const prisma = new PrismaClient();
  const live = { deletedAt: null } as const;

  const ids = {
    student: (await prisma.student.findFirstOrThrow({
      where: { ...live, batchMappings: { some: { deletedAt: null } } },
    })).studentId,
    /* The batch that student sits on, so the certificate screen can be shot in
       its WORKING state rather than its empty one — an empty screen proves the
       route exists and nothing else. */
    studentBatch: (await prisma.studentBatchMapping.findFirstOrThrow({
      where: { deletedAt: null, student: live },
    })).batchId,
    session: (await prisma.batchSession.findFirstOrThrow({ where: { ...live, status: "COMPLETED" } })).sessionId,
    certificate: (await prisma.certificate.findFirstOrThrow({ where: {} })).certificateId,
    /* Prefer a list still being decided — a released one shows outcomes and
       none of the controls that produced them. */
    submission: (
      (await prisma.certificateSubmission.findFirst({
        where: { ...live, rows: { some: { status: "PENDING", deletedAt: null } } },
      })) ?? (await prisma.certificateSubmission.findFirstOrThrow({ where: live }))
    ).submissionId,
    contract: (await prisma.collegeContract.findFirstOrThrow({ where: live })).contractId,
    ledger: (await prisma.studentFeeLedger.findFirstOrThrow({ where: live })).ledgerId,
    college: (await prisma.college.findFirstOrThrow({ where: live })).collegeId,
    question: (await prisma.questionBank.findFirstOrThrow({ where: live })).questionId,
  };
  await prisma.$disconnect();

  /** Each shot: a file name, the route, and what it is meant to show. */
  const shots: Array<{ name: string; route: string; note: string }> = [
    { name: "01-certificate-issue", route: `/students/${ids.student}/certificate?batchId=${ids.studentBatch}`, note: "Issue a certificate — eligibility, then the sign-off" },
    { name: "02-certificate-detail", route: `/students/certificates/${ids.certificate}`, note: "One certificate, with revoke" },
    { name: "03-submission-queue", route: "/colleges/submissions", note: "The college certificate-list queue" },
    { name: "04-submission-review", route: `/colleges/submissions/${ids.submission}`, note: "Review a list, name by name" },
    { name: "05-submission-new", route: `/colleges/submissions/new?collegeId=${ids.college}`, note: "File a college's list" },
    { name: "06-student-import", route: "/students/import", note: "Bulk import students" },
    { name: "07-record-payment", route: "/fee-ledger/record", note: "Record payment — who is paying" },
    { name: "08-contract-new", route: "/fee-ledger/contracts/new", note: "New college contract" },
    { name: "09-contract-detail", route: `/fee-ledger/contracts/${ids.contract}`, note: "Contract with its schedule editor" },
    { name: "10-ledger-schedule", route: `/fee-ledger/${ids.ledger}`, note: "A student ledger — same schedule editor" },
    { name: "11-question-new", route: "/courses/question-bank/new", note: "Add a question" },
    { name: "12-question-edit", route: `/courses/question-bank/${ids.question}/edit`, note: "Edit a question" },
    { name: "13-question-bank", route: "/courses/question-bank", note: "The bank, with edit and delete on each card" },
    { name: "14-session-detail", route: `/batches/sessions/${ids.session}`, note: "Session with delete and assignment verbs" },
    { name: "15-assignment-new", route: `/batches/sessions/${ids.session}/assignments/new`, note: "Set an assignment" },
    { name: "16-students-delete", route: "/students", note: "Delete on the row" },
    { name: "17-colleges-delete", route: "/colleges", note: "Delete on the row" },
    { name: "18-notifications", route: "/notifications", note: "Mark all read" },
    { name: "19-account", route: "/account", note: "The photo field the page promised" },
  ];

  const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {});
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(25000);

  // The font stylesheet comes from a CDN a sandboxed box cannot reach, and a
  // request that never settles makes every wait a timeout.
  await page.route("**fonts.googleapis.com**", (route) => route.abort());
  await page.route("**fonts.gstatic.com**", (route) => route.abort());

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 30000 });

  for (const shot of shots) {
    const response = await page.goto(BASE + shot.route, { waitUntil: "domcontentloaded" });
    const status = response?.status() ?? 0;
    if (status >= 400) {
      console.log(`  ✗ ${shot.name} — HTTP ${status} ${shot.route}`);
      continue;
    }
    // Let hydration settle so client controls are in their real state.
    await page.waitForTimeout(900);
    await page.screenshot({ path: join(OUT, `${shot.name}.png`), fullPage: true });
    console.log(`  ✓ ${shot.name} — ${shot.note}`);
  }

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
