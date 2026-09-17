/**
 * No screen drags the page sideways on a phone.
 *
 * ── Why this needed its own suite ───────────────────────────────────────
 *
 * `verify:actions` walks every route at 1440px and proves it renders. A page
 * can pass that and still be broken at 400px in a way nobody notices from a
 * desk: `/courses` could be dragged 981px to the right into blank canvas, with
 * the fixed rail sitting still and the entire console gone off the left edge.
 * Nothing threw, nothing 404'd, no control was inert. The page simply went
 * away if you swiped.
 *
 * It is also the kind of fault that comes back. It arrives from a single
 * utility — one row of buttons that will not wrap, one table that escapes its
 * scroller — so a screenshot review catches it once and the next module
 * reintroduces it. This walks every route at a phone width and fails.
 *
 * ── What it measures, and why that is not obvious ───────────────────────
 *
 * `document.documentElement.scrollWidth` alone is not enough: it can read wide
 * on a page that cannot actually be scrolled. So each route is SCROLLED — the
 * page is asked to go to x=3000 and then asked where it ended up. A route that
 * lands anywhere but 0 can be swiped off-screen by a real thumb.
 *
 * ── How the offender is named ───────────────────────────────────────────
 *
 * Reading which element "sticks out" reports dozens of innocents, because
 * anything inside a horizontal scroller has a bounding box past the viewport
 * and is perfectly well clipped. So the suite bisects instead: walk down from
 * `body`, hide one child at a time, and keep the one whose absence makes the
 * page fit. The path it prints is the path to the thing actually responsible.
 *
 *   npm run start --workspace @gurukulam/web     # in another shell
 *   npm run verify:widths --workspace @gurukulam/web
 */
import { PrismaClient } from "@gurukulam/db";
import { chromium } from "playwright";

const BASE = process.env["VERIFY_BASE_URL"] ?? "http://127.0.0.1:3000";
const EXECUTABLE = process.env["CHROMIUM_PATH"] ?? process.env["CHROME"];
const EMAIL = process.env["VERIFY_EMAIL"] ?? "priya@gurukulam.test";
const PASSWORD = process.env["VERIFY_PASSWORD"] ?? "Gurukulam@2026";

/**
 * 400px, not 320. The design system's narrow case is a modern phone in
 * portrait; 320px is an iPhone SE 1 and nothing in this product is sized for
 * it. Checking a width nobody uses produces failures nobody will fix.
 */
const NARROW = 400;

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
    question: (await prisma.questionBank.findFirstOrThrow({ where: live })).questionId,
    requirement: (await prisma.collegeRequirement.findFirstOrThrow({ where: live })).requirementId,
    job: (await prisma.jobPosting.findFirstOrThrow({ where: live })).jobPostingId,
    admin: (await prisma.adminUser.findFirstOrThrow({ where: live })).adminUserId,
    city: (await prisma.city.findFirstOrThrow({ where: live })).cityId,
    country: (await prisma.country.findFirstOrThrow({ where: live })).countryId,
    role: (await prisma.role.findFirstOrThrow({ where: live })).roleId,
    transaction: (await prisma.paymentTransaction.findFirstOrThrow({ where: live })).transactionId,
  };

  // The same walk as verify:actions. Kept as its own list rather than imported
  // because that suite builds it inside `main` around its own ids, and one
  // module adding a route should not have to remember two places — a route
  // missing here is a route nobody checks at width, which is visible in the
  // count this prints.
  const routes = [
    "/dashboard", "/notifications", "/account", "/account/password",
    "/colleges", "/colleges/new", `/colleges/${ids.college}`, `/colleges/${ids.college}/edit`,
    `/colleges/${ids.college}/contacts`, `/colleges/${ids.college}/access`,
    "/colleges/contacts", "/colleges/access",
    "/colleges/requirements", "/colleges/requirements/new",
    `/colleges/requirements/${ids.requirement}`,
    "/colleges/submissions", `/colleges/submissions/${ids.submission}`,
    `/colleges/submissions/new?collegeId=${ids.college}`,
    "/students", "/students/new", `/students/${ids.student}/certificate`,
    `/students/${ids.student}`, `/students/${ids.student}/edit`,
    `/students/${ids.student}/allocate`, "/students/unallocated", "/students/certificates",
    "/students/import", `/students/import?collegeId=${ids.college}`,
    "/courses", "/courses/new", `/courses/${ids.course}`, `/courses/${ids.course}/edit`,
    "/courses/question-bank", "/courses/question-bank/new",
    `/courses/question-bank/${ids.question}/edit`,
    "/batches", "/batches/new", `/batches/${ids.batch}`, `/batches/${ids.batch}/edit`,
    `/batches/${ids.batch}/roster`, `/batches/${ids.batch}/recordings`,
    `/batches/${ids.batch}/sessions/new`, `/batches/${ids.batch}/sessions/upload`,
    "/batches/sessions", `/batches/sessions/${ids.session}`,
    `/batches/sessions/${ids.session}/edit`,
    "/trainers", "/trainers/new", `/trainers/${ids.trainer}`, `/trainers/${ids.trainer}/edit`,
    "/trainers/calendar",
    "/fee-ledger", "/fee-ledger/record", "/fee-ledger/contracts/new",
    `/fee-ledger/contracts/${ids.contract}`, `/fee-ledger/${ids.ledger}`, "/fee-ledger/contracts",
    "/hiring", "/hiring/new", `/hiring/${ids.job}`, `/hiring/${ids.job}/edit`,
    "/reports", "/reports/collections", "/reports/outstanding", "/reports/unallocated",
    "/reports/batch-progress",
    "/settings", "/settings/administrators", "/settings/administrators/new",
    `/settings/administrators/${ids.admin}/edit`,
    "/settings/cities", "/settings/cities/new", `/settings/cities/${ids.city}/edit`,
    "/settings/countries", "/settings/countries/new", `/settings/countries/${ids.country}/edit`,
    "/settings/roles", "/settings/roles/new", `/settings/roles/${ids.role}/edit`,
    `/receipts/${ids.transaction}`,
  ];

  const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {});
  const page = await browser.newPage({ viewport: { width: NARROW, height: 900 } });
  page.setDefaultTimeout(20000);
  await page.route("**fonts.googleapis.com**", (route) => route.abort());
  await page.route("**fonts.gstatic.com**", (route) => route.abort());

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 30000 });

  const offenders: string[] = [];

  for (const route of routes) {
    const response = await page.goto(BASE + route, { waitUntil: "domcontentloaded" });
    if ((response?.status() ?? 0) >= 400) continue; // verify:actions owns that complaint
    await page.waitForLoadState("load");

    const verdict = await page.evaluate(() => {
      const fits = window.innerWidth + 1;
      window.scrollTo(3000, 0);
      const dragged = Math.round(window.scrollX);
      window.scrollTo(0, 0);
      if (dragged === 0) return null;

      // Bisect down to the element actually responsible: the deepest child
      // whose absence makes the page fit.
      const trail: string[] = [];
      let current: Element = document.body;
      for (let depth = 0; depth < 10; depth += 1) {
        let culprit: Element | null = null;
        for (const child of Array.from(current.children)) {
          const box = child as HTMLElement;
          const before = box.style.display;
          box.style.display = "none";
          const fitsNow = document.documentElement.scrollWidth <= fits;
          box.style.display = before;
          if (fitsNow) { culprit = child; break; }
        }
        if (!culprit) break;
        const classes = (culprit.className || "").toString().replace(/\s+/g, " ").slice(0, 70);
        trail.push(`${culprit.tagName.toLowerCase()}${classes ? `.${classes}` : ""}`);
        current = culprit;
      }
      return { dragged, trail };
    });

    if (verdict !== null) {
      const where = verdict.trail.length === 0
        ? "no single element accounts for it"
        : verdict.trail[verdict.trail.length - 1];
      offenders.push(`${route} — drags ${verdict.dragged}px sideways · ${where}`);
    }
  }

  await browser.close();

  console.log(`\n  ${routes.length} routes walked at ${NARROW}px\n`);
  if (offenders.length === 0) {
    console.log("  \x1b[32m✓\x1b[0m nothing drags the page sideways\n");
    process.exitCode = 0;
    return;
  }
  console.log(`  \x1b[31m✗\x1b[0m screens that scroll sideways: ${offenders.length}`);
  for (const row of offenders) console.log(`      \x1b[31m${row}\x1b[0m`);
  console.log("");
  process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
