/**
 * Every screen renders, every link goes somewhere, every control does something.
 *
 * This is the suite for the complaint "Edit does nothing". A button that looks
 * like a verb and is inert is worse than a missing button: the operator cannot
 * tell "not built" from "I clicked the wrong thing", so they file a bug against
 * a feature that works and stop trusting the ones that do.
 *
 * Three things are checked, and the third is the one that matters:
 *
 *   1. every route renders — a real HTTP status, an <h1>, no page error;
 *   2. every internal link the console offers resolves;
 *   3. every control is WIRED — a submit inside a form, a link, or a React
 *      onClick handler. Checking for an `onclick` ATTRIBUTE would pass
 *      everything, because React never writes one; the handler is a property.
 *
 * Read-only. It signs in, walks, and writes nothing — unlike the API's
 * verify:* suites, which create records.
 *
 *   npm run start --workspace @gurukulam/web     # in another shell
 *   npm run verify:actions --workspace @gurukulam/web
 */
import { PrismaClient } from "@gurukulam/db";
import { chromium } from "playwright";

const BASE = process.env["VERIFY_BASE_URL"] ?? "http://127.0.0.1:3000";
const EXECUTABLE = process.env["CHROMIUM_PATH"] ?? process.env["CHROME"];
const EMAIL = process.env["VERIFY_EMAIL"] ?? "priya@gurukulam.test";
const PASSWORD = process.env["VERIFY_PASSWORD"] ?? "Gurukulam@2026";

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
    certificate: (await prisma.certificate.findFirstOrThrow({ where: live })).certificateId,
    question: (await prisma.questionBank.findFirstOrThrow({ where: live })).questionId,
    requirement: (await prisma.collegeRequirement.findFirstOrThrow({ where: live })).requirementId,
    job: (await prisma.jobPosting.findFirstOrThrow({ where: live })).jobPostingId,
    admin: (await prisma.adminUser.findFirstOrThrow({ where: live })).adminUserId,
    city: (await prisma.city.findFirstOrThrow({ where: live })).cityId,
    country: (await prisma.country.findFirstOrThrow({ where: live })).countryId,
    role: (await prisma.role.findFirstOrThrow({ where: live })).roleId,
    transaction: (await prisma.paymentTransaction.findFirstOrThrow({ where: live })).transactionId,
  };

  const routes = [
    "/dashboard", "/notifications", "/account", "/account/password",
    "/colleges", "/colleges/new", `/colleges/${ids.college}`, `/colleges/${ids.college}/edit`,
    `/colleges/${ids.college}/contacts`, `/colleges/${ids.college}/access`,
    "/colleges/contacts", "/colleges/access",
    "/colleges/requirements", "/colleges/requirements/new",
    `/colleges/requirements/${ids.requirement}`,
    "/colleges/submissions", `/colleges/submissions/${ids.submission}`,
    `/colleges/submissions/new?collegeId=${ids.college}`,
    "/students", "/students/new", `/students/${ids.student}/certificate`, `/students/${ids.student}`, `/students/${ids.student}/edit`,
    `/students/${ids.student}/allocate`, "/students/unallocated", "/students/certificates", "/students/import",
    "/colleges/submissions",
    `/students/import?collegeId=${ids.college}`,
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(20000);

  // The font stylesheet comes from a CDN a sandboxed box cannot reach, and a
  // request that never settles makes every wait a timeout.
  await page.route("**fonts.googleapis.com**", (route) => route.abort());
  await page.route("**fonts.gstatic.com**", (route) => route.abort());

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(String(error).slice(0, 140)));

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 30000 });

  const brokenPages: string[] = [];
  const inertControls: string[] = [];
  const unsubmittable: string[] = [];
  const linkTargets = new Set<string>();

  for (const route of routes) {
    pageErrors.length = 0;
    const response = await page.goto(BASE + route, { waitUntil: "domcontentloaded" });
    const status = response?.status() ?? 0;
    if (status >= 400) {
      brokenPages.push(`${route} — HTTP ${status}`);
      continue;
    }
    /*
     * Server Components stream, and React attaches click handlers during
     * hydration. Asking before that lands reports every client component as
     * inert — so wait for hydration.
     *
     * ── Why EVERY candidate, not just one ──────────────────────────────────
     *
     * This waited for `some` button to carry React props, and that made the
     * whole check a race: a page hydrates island by island, so a header button
     * satisfying the wait says nothing about the twenty-seven Delete buttons in
     * the table below it. Measured on `/students`: at the moment `some` first
     * passes, 27 of 27 candidates are still bare, and 200ms later none are. The
     * suite therefore reported "Delete does nothing" on a control that works,
     * on some runs and not others — a guard that cannot tell a fault from a
     * frame is worse than no guard, because a real one gets waved through as
     * the flake everybody has learned to re-run.
     *
     * The predicate is now the same one the assertion uses, so what it waits for
     * and what it judges cannot disagree. A page that never finishes hydrating
     * still falls through on the timeout and is judged as it stands — which is
     * the honest answer for a page that takes ten seconds to wake up.
     */
    await page.waitForLoadState("load");
    await page
      .waitForFunction(() => {
        const candidates = [...document.querySelectorAll("button")].filter((element) => {
          const button = element as HTMLButtonElement;
          return !button.disabled && button.closest("form") === null && button.closest("a") === null;
        });
        if (candidates.length === 0) return true;
        return candidates.every((element) => {
          const key = Object.keys(element).find((k) => k.startsWith("__reactProps$"));
          const props = key === undefined
            ? null
            : (element as unknown as Record<string, { onClick?: unknown }>)[key];
          return props !== null && typeof props?.onClick === "function";
        });
      }, undefined, { timeout: 10000 })
      .catch(() => undefined);

    const found = await page.evaluate(() => {
      const links: string[] = [];
      document.querySelectorAll("a[href]").forEach((anchor) => {
        const href = anchor.getAttribute("href") ?? "";
        if (href.startsWith("/")) links.push(href);
      });

      const inert: string[] = [];
      document.querySelectorAll("button").forEach((element) => {
        const button = element as HTMLButtonElement;
        if (button.disabled) return;
        // Wired three legitimate ways: it submits a form, it sits inside a
        // link, or React gave it a click handler. React attaches handlers as
        // properties on the DOM node, never as an attribute — so looking for
        // `onclick` would pass every button in the app.
        if (button.closest("form") !== null) return;
        if (button.closest("a") !== null) return;
        const key = Object.keys(button).find((k) => k.startsWith("__reactProps$"));
        const props = key === undefined
          ? null
          : (button as unknown as Record<string, { onClick?: unknown }>)[key];
        if (props && typeof props.onClick === "function") return;
        const name = (button.textContent ?? "").trim().replace(/\s+/g, " ")
          || button.getAttribute("aria-label")
          || button.getAttribute("title")
          || `<icon-only ${button.className.slice(0, 40)}>`;
        inert.push(name.slice(0, 60));
      });

      const forms = [...document.querySelectorAll("form")].map((form) => ({
        fields: form.querySelectorAll("input, select, textarea").length,
        submits: form.querySelectorAll('button[type="submit"], button:not([type])').length,
        bound: form.getAttribute("action") !== null || typeof (form as unknown as {
          __reactProps?: unknown;
        }) === "object",
      }));

      return {
        links,
        inert,
        forms,
        heading: document.querySelector("h1")?.textContent?.trim() ?? "",
      };
    });

    if (found.heading === "") brokenPages.push(`${route} — rendered without an <h1>`);
    for (const href of found.links) linkTargets.add(href.split("?")[0]!.split("#")[0]!);
    for (const label of found.inert) inertControls.push(`${route} — “${label}”`);
    for (const form of found.forms) {
      if (form.fields > 0 && form.submits === 0) {
        unsubmittable.push(`${route} — ${form.fields} fields and no way to submit them`);
      }
    }
    if (pageErrors[0] !== undefined) brokenPages.push(`${route} — ${pageErrors[0]}`);
  }

  // Every link the console offers has to resolve. A button pointing at a route
  // that does not exist teaches an operator the feature is broken.
  const walked = new Set(routes);
  const deadLinks: string[] = [];
  for (const target of [...linkTargets].sort()) {
    if (walked.has(target) || target === "/login" || target.startsWith("/auth")) continue;
    // A link that returns a FILE cannot be navigated to: the browser starts a
    // download and `goto` never resolves, which hung this suite the moment
    // Export CSV appeared. Fetch it instead — which checks more, not less,
    // because it can also say whether a CSV actually came back.
    if (target.endsWith("/export")) {
      // Fetched from INSIDE the page, not through `page.request`: the latter
      // keeps its own cookie jar and does not attach the session, so it saw a
      // redirect to /login and reported four working exports as broken. An
      // in-page fetch runs in the operator's own security context, which is
      // the thing being asserted about.
      const result = await page.evaluate(async (url) => {
        const response = await fetch(url, { credentials: "include" });
        return { status: response.status, type: response.headers.get("content-type") ?? "" };
      }, target);
      if (result.status >= 400) {
        deadLinks.push(`${target} — HTTP ${result.status}`);
      } else if (!result.type.startsWith("text/csv")) {
        deadLinks.push(`${target} — returned ${result.type.slice(0, 40)} rather than a CSV`);
      }
      continue;
    }

    const response = await page.goto(BASE + target, { waitUntil: "domcontentloaded" });
    const status = response?.status() ?? 0;
    if (status >= 400) deadLinks.push(`${target} — HTTP ${status}`);
  }

  await browser.close();

  const report = (title: string, rows: readonly string[]): number => {
    const mark = rows.length === 0 ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
    console.log(`  ${mark} ${title}: ${rows.length}`);
    for (const row of rows.slice(0, 40)) console.log(`      \x1b[31m${row}\x1b[0m`);
    return rows.length;
  };

  console.log(`\n  ${routes.length} routes walked, ${linkTargets.size} distinct link targets followed\n`);
  const total =
    report("pages that failed to render", brokenPages) +
    report("links pointing at nothing", deadLinks) +
    report("forms with no way to submit", unsubmittable) +
    report("controls that do nothing", inertControls);

  console.log(total === 0 ? "\n  the console walks clean\n" : `\n  ${total} problem(s)\n`);
  process.exitCode = total === 0 ? 0 : 1;
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
