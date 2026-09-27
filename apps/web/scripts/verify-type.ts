/**
 * One type scale, applied the same way everywhere.
 *
 * ── Why a runtime check and not a grep ──────────────────────────────────
 *
 * `text-h1`, `text-body`, `text-caption` are semantic names, and a grep can
 * confirm nobody wrote `text-[15px]`. What it cannot tell you is whether two
 * things that mean the same thing were given the same name. On the colleges
 * list, one row rendered the partnership at 14px, the city at 16px, the code at
 * 12px and the portal status at 12px — four sizes across four peer cells, every
 * one of them a legal token. Read down the column and it looks deliberate; read
 * across the row and it is noise.
 *
 * So this reads the COMPUTED size of real text on real pages.
 *
 * ── The two rules ───────────────────────────────────────────────────────
 *
 * **1. Every rendered size is on the scale.** The scale is declared once, in
 * the `@theme` block of `globals.css`. Anything else on screen arrived from an
 * arbitrary value, a stock Tailwind class that slipped in, or a browser
 * default nobody meant to inherit.
 *
 * **2. A table cell renders at a cell size.** Inside a `<td>` there are exactly
 * two jobs: the value (16px — a name, a date, a count, a status) and the
 * supporting line under it (12px — the business code, the trailing detail).
 * 14px is the size for PROSE: descriptions, hints, the sentence under a
 * heading. Prose does not belong in a table cell, and when it appears there it
 * is always because a column was written in isolation.
 *
 * Two things are exempt from rule 2, and both for the same reason: their type
 * belongs to a COMPONENT rather than to the row. A `sm` button is 14px by
 * design, and the row's Edit and Delete verbs are the same control they are
 * everywhere else. A badge — `Chip`, `SegmentTag` — is 12px bold, and it is
 * 12px bold in a card and a page header too. The exemption only holds because
 * the badges agree with each other: `SegmentTag` used to be 10px while `Chip`
 * was 12px, which is the same kind of thing reading as two kinds, and that was
 * fixed rather than excused.
 *
 *   npm run start --workspace @gurukulam/web     # in another shell
 *   npm run verify:type --workspace @gurukulam/web
 */
import { PrismaClient } from "@gurukulam/db";
import { chromium } from "playwright";

const BASE = process.env["VERIFY_BASE_URL"] ?? "http://127.0.0.1:3000";
const EXECUTABLE = process.env["CHROMIUM_PATH"] ?? process.env["CHROME"];
const EMAIL = process.env["VERIFY_EMAIL"] ?? "priya@gurukulam.test";
const PASSWORD = process.env["VERIFY_PASSWORD"] ?? "Gurukulam@2026";

/**
 * The scale, in px, exactly as `globals.css` declares it. `display` 36,
 * `metric` 30, `metric-sm` 25, `h1` 20, `h2` 18, `h3`/`body` 16, `body-sm` 14,
 * `caption` 12, `overline` 10.
 *
 * The flag primitive's 56/72/88 are not type — they are an emoji rendered at
 * three sizes, which is artwork sized in px on purpose.
 */
const SCALE = new Set([36, 30, 25, 20, 18, 16, 14, 12, 10, 56, 72, 88]);

/** What a `<td>` may render: a value, or the line under it. */
const CELL_SIZES = new Set([16, 12]);

const prisma = new PrismaClient();
const live = { deletedAt: null };

async function main(): Promise<void> {
  const ids = {
    student: (await prisma.student.findFirstOrThrow({ where: live })).studentId,
    batch: (await prisma.batch.findFirstOrThrow({ where: live })).batchId,
    session: (await prisma.batchSession.findFirstOrThrow({ where: live })).sessionId,
    college: (await prisma.college.findFirstOrThrow({ where: live })).collegeId,
    course: (await prisma.course.findFirstOrThrow({ where: live })).courseId,
    trainer: (await prisma.trainer.findFirstOrThrow({ where: live })).trainerId,
    ledger: (await prisma.studentFeeLedger.findFirstOrThrow({ where: live })).ledgerId,
    contract: (await prisma.collegeContract.findFirstOrThrow({ where: live })).contractId,
    submission: (await prisma.certificateSubmission.findFirstOrThrow({ where: live })).submissionId,
    certificate: (await prisma.certificate.findFirstOrThrow({ where: {} })).certificateId,
    verificationCode: (
      await prisma.certificate.findFirstOrThrow({ where: { deletedAt: null, status: "ISSUED" } })
    ).verificationCode,
    requirement: (await prisma.collegeRequirement.findFirstOrThrow({ where: live })).requirementId,
    job: (await prisma.jobPosting.findFirstOrThrow({ where: live })).jobPostingId,
    transaction: (await prisma.paymentTransaction.findFirstOrThrow({ where: live })).transactionId,
  };

  /*
   * Every screen that renders a table or a record summary — which is where a
   * size drifts, because a column or a card gets written on its own and never
   * seen beside its peers.
   */
  const routes = [
    "/dashboard",
    "/colleges", `/colleges/${ids.college}`, `/colleges/${ids.college}/contacts`,
    `/colleges/${ids.college}/access`, `/colleges/${ids.college}/certificates`,
    "/colleges/contacts", "/colleges/access", "/colleges/requirements",
    `/colleges/requirements/${ids.requirement}`,
    "/colleges/submissions", `/colleges/submissions/${ids.submission}`,
    "/students", `/students/${ids.student}`, "/students/unallocated",
    "/students/certificates", `/students/certificates/${ids.certificate}`,
    "/courses", `/courses/${ids.course}`, "/courses/question-bank",
    "/batches", `/batches/${ids.batch}`, `/batches/${ids.batch}/roster`,
    `/batches/${ids.batch}/recordings`, "/batches/sessions",
    `/batches/sessions/${ids.session}`,
    "/trainers", `/trainers/${ids.trainer}`, "/trainers/calendar",
    "/fee-ledger", `/fee-ledger/${ids.ledger}`, "/fee-ledger/contracts",
    `/fee-ledger/contracts/${ids.contract}`, "/fee-ledger/record",
    "/hiring", `/hiring/${ids.job}`,
    "/reports", "/reports/collections", "/reports/outstanding",
    "/reports/unallocated", "/reports/batch-progress",
    "/settings", "/settings/administrators", "/settings/cities",
    "/settings/countries", "/settings/roles",
    "/account", "/notifications",
    `/receipts/${ids.transaction}`,
    // Public. One scale everywhere includes the one page a stranger reads.
    "/verify", `/verify/${ids.verificationCode}`,
  ];

  const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {});
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(20000);
  await page.route("**fonts.googleapis.com**", (route) => route.abort());
  await page.route("**fonts.gstatic.com**", (route) => route.abort());

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 30000 });

  const offScale: string[] = [];
  const wrongInCell: string[] = [];

  for (const route of routes) {
    const response = await page.goto(BASE + route, { waitUntil: "domcontentloaded" });
    if ((response?.status() ?? 0) >= 400) continue; // verify:actions owns that complaint
    await page.waitForLoadState("load");

    const found = await page.evaluate(
      ({ scale, cellSizes }) => {
        const bad: { size: number; text: string; where: string }[] = [];
        const cells: { size: number; text: string; column: string }[] = [];

        for (const el of Array.from(document.querySelectorAll("body *"))) {
          // Only elements that render text of their own, so a wrapper is not
          // blamed for its child's size.
          const own = Array.from(el.childNodes)
            .filter((n) => n.nodeType === 3)
            .map((n) => (n.textContent ?? "").trim())
            .join(" ")
            .trim();
          if (own === "") continue;
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") continue;
          const size = Math.round(parseFloat(style.fontSize));

          if (!scale.includes(size)) {
            bad.push({
              size,
              text: own.slice(0, 40),
              where: `${el.tagName.toLowerCase()}.${(el.className || "").toString().slice(0, 50)}`,
            });
          }

          // Rule 2, with controls exempted: a button's label is part of the
          // control, not of the row's content.
          const cell = el.closest("td");
          if (cell === null) continue;
          if (el.closest("button") !== null) continue;
          if (el.closest('a[class*="rounded-full"]') !== null) continue;
          if (el.closest("input, select, textarea") !== null) continue;
          // A badge carries its own type. Both of the console's are 12px bold,
          // which `CELL_SIZES` already allows, so this only skips one that is
          // deliberately something else.
          if (el.closest('[class*="rounded-full"][class*="font-bold"]') !== null) continue;
          if (cellSizes.includes(size)) continue;

          const table = cell.closest("table");
          const index = Array.from(cell.parentElement?.children ?? []).indexOf(cell);
          const header = table?.querySelectorAll("thead th")[index];
          cells.push({
            size,
            text: own.slice(0, 30),
            column: (header?.textContent ?? `column ${index + 1}`).trim() || `column ${index + 1}`,
          });
        }
        return { bad, cells };
      },
      { scale: [...SCALE], cellSizes: [...CELL_SIZES] },
    );

    const seenOff = new Set<string>();
    for (const row of found.bad) {
      const key = `${row.size}|${row.where}`;
      if (seenOff.has(key)) continue;
      seenOff.add(key);
      offScale.push(`${route} — ${row.size}px is not on the scale · ${row.where} · “${row.text}”`);
    }
    const seenCell = new Set<string>();
    for (const row of found.cells) {
      const key = `${row.size}|${row.column}`;
      if (seenCell.has(key)) continue;
      seenCell.add(key);
      wrongInCell.push(`${route} — “${row.column}” renders at ${row.size}px · “${row.text}”`);
    }
  }

  await browser.close();

  const report = (title: string, rows: readonly string[]): number => {
    const mark = rows.length === 0 ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
    console.log(`  ${mark} ${title}: ${rows.length}`);
    for (const row of rows.slice(0, 40)) console.log(`      \x1b[31m${row}\x1b[0m`);
    if (rows.length > 40) console.log(`      \x1b[31m… and ${rows.length - 40} more\x1b[0m`);
    return rows.length;
  };

  console.log(`\n  ${routes.length} routes read for type\n`);
  const total =
    report("text rendered at a size the scale does not have", offScale) +
    report("table cells rendered at a size that is not a cell size", wrongInCell);

  console.log(total === 0 ? "\n  one scale, applied the same way everywhere\n" : `\n  ${total} problem(s)\n`);
  process.exitCode = total === 0 ? 0 : 1;
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
