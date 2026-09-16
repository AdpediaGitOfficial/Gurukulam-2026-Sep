/**
 * Does Edit actually save?
 *
 * verify:actions proves every screen renders and every control is wired. That
 * is not the same claim. A form can render, submit, and change nothing — the
 * action swallows an error, the field never reaches the API, the API writes a
 * different column. So this drives the REAL form in a REAL browser and then
 * reads the row back out of the database with Prisma. Nothing is asserted from
 * what the screen says afterwards; the screen is the thing under test.
 *
 * Each edit case changes one field of one existing record to a marker value,
 * checks the database moved, and puts the original back. Each add case creates
 * a record, checks its business ID was generated on save, and hard-deletes it. It writes to the database it
 * is pointed at, so: seeded development box only, exactly like the API's
 * verify:* suites.
 *
 *   npm run start --workspace @gurukulam/web     # in another shell
 *   npm run verify:forms --workspace @gurukulam/web
 */
import { PrismaClient } from "@gurukulam/db";
import { chromium, type Page } from "playwright";

const BASE = process.env["VERIFY_BASE_URL"] ?? "http://127.0.0.1:3000";
const EXECUTABLE = process.env["CHROMIUM_PATH"] ?? process.env["CHROME"];
const EMAIL = process.env["VERIFY_EMAIL"] ?? "priya@gurukulam.test";
const PASSWORD = process.env["VERIFY_PASSWORD"] ?? "Gurukulam@2026";

const prisma = new PrismaClient();
const live = { deletedAt: null };
const MARK = `edit-probe-${Date.now()}`;
/** Two letters that change every run, so a leftover row cannot poison the next. */
const ISO2 = String.fromCharCode(
  88 + (Date.now() % 2),
  65 + (Math.floor(Date.now() / 1000) % 26),
);

let passed = 0;
let failed = 0;
const ok = (name: string, detail = ""): void => {
  passed += 1;
  console.log(`  \x1b[32m✓\x1b[0m ${name}${detail ? `  \x1b[90m${detail}\x1b[0m` : ""}`);
};
const bad = (name: string, detail: string): void => {
  failed += 1;
  console.log(`  \x1b[31m✗\x1b[0m ${name}\n      \x1b[31m${detail}\x1b[0m`);
};

/**
 * Loads an edit form, changes one field, submits, and waits for the navigation
 * the action performs on success. A form that stays put has refused the save,
 * and its own error banner is the most useful thing to report.
 */
async function submitEdit(
  page: Page,
  route: string,
  field: string,
  value: string,
): Promise<string | null> {
  await page.goto(BASE + route, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");

  const input = page.locator(`[name="${field}"]`).first();
  if ((await input.count()) === 0) return `the form has no field called "${field}"`;
  await input.fill(value);

  const before = page.url();
  await page.locator('form button[type="submit"]').last().click();
  // The action redirects on success. Anything else and we are still on the form.
  await page.waitForURL((url) => url.toString() !== before, { timeout: 15000 }).catch(() => undefined);
  if (page.url() === before) {
    const alert = await page.locator('[role="alert"]').first().innerText().catch(() => "");
    return `the form did not save: ${alert.replace(/\s+/g, " ").slice(0, 160) || "no error shown"}`;
  }
  return null;
}

async function main(): Promise<void> {
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

  /** One case: read the original, edit through the UI, check the DB, restore. */
  type Case = {
    name: string;
    route: (id: string) => string;
    field: string;
    find: () => Promise<{ id: string; original: string }>;
    read: (id: string) => Promise<string>;
    restore: (id: string, original: string) => Promise<void>;
  };

  const cases: Case[] = [
    {
      name: "a student's name",
      field: "firstName",
      route: (id) => `/students/${id}/edit`,
      find: async () => {
        const row = await prisma.student.findFirstOrThrow({ where: live });
        return { id: row.studentId, original: row.firstName };
      },
      read: async (id) => (await prisma.student.findUniqueOrThrow({ where: { studentId: id } })).firstName,
      restore: async (id, original) =>
        void (await prisma.student.update({ where: { studentId: id }, data: { firstName: original } })),
    },
    {
      name: "a college's short name",
      field: "shortName",
      route: (id) => `/colleges/${id}/edit`,
      find: async () => {
        const row = await prisma.college.findFirstOrThrow({ where: live });
        return { id: row.collegeId, original: row.shortName ?? "" };
      },
      read: async (id) => (await prisma.college.findUniqueOrThrow({ where: { collegeId: id } })).shortName ?? "",
      restore: async (id, original) =>
        void (await prisma.college.update({ where: { collegeId: id }, data: { shortName: original || null } })),
    },
    {
      name: "a course's name",
      field: "name",
      route: (id) => `/courses/${id}/edit`,
      find: async () => {
        const row = await prisma.course.findFirstOrThrow({ where: live });
        return { id: row.courseId, original: row.name };
      },
      read: async (id) => (await prisma.course.findUniqueOrThrow({ where: { courseId: id } })).name,
      restore: async (id, original) =>
        void (await prisma.course.update({ where: { courseId: id }, data: { name: original } })),
    },
    {
      name: "a batch's name",
      field: "name",
      route: (id) => `/batches/${id}/edit`,
      find: async () => {
        const row = await prisma.batch.findFirstOrThrow({ where: live });
        return { id: row.batchId, original: row.name };
      },
      read: async (id) => (await prisma.batch.findUniqueOrThrow({ where: { batchId: id } })).name,
      restore: async (id, original) =>
        void (await prisma.batch.update({ where: { batchId: id }, data: { name: original } })),
    },
    {
      name: "a trainer's name",
      field: "name",
      route: (id) => `/trainers/${id}/edit`,
      find: async () => {
        const row = await prisma.trainer.findFirstOrThrow({ where: live });
        return { id: row.trainerId, original: row.name };
      },
      read: async (id) => (await prisma.trainer.findUniqueOrThrow({ where: { trainerId: id } })).name,
      restore: async (id, original) =>
        void (await prisma.trainer.update({ where: { trainerId: id }, data: { name: original } })),
    },
    {
      name: "a city's name",
      field: "name",
      route: (id) => `/settings/cities/${id}/edit`,
      find: async () => {
        const row = await prisma.city.findFirstOrThrow({ where: live });
        return { id: row.cityId, original: row.name };
      },
      read: async (id) => (await prisma.city.findUniqueOrThrow({ where: { cityId: id } })).name,
      restore: async (id, original) =>
        void (await prisma.city.update({ where: { cityId: id }, data: { name: original } })),
    },
    {
      name: "a country's name",
      field: "name",
      route: (id) => `/settings/countries/${id}/edit`,
      find: async () => {
        const row = await prisma.country.findFirstOrThrow({ where: live });
        return { id: row.countryId, original: row.name };
      },
      read: async (id) => (await prisma.country.findUniqueOrThrow({ where: { countryId: id } })).name,
      restore: async (id, original) =>
        void (await prisma.country.update({ where: { countryId: id }, data: { name: original } })),
    },
  ];

  for (const testCase of cases) {
    const { id, original } = await testCase.find();
    const want = `${original.slice(0, 20)} ${MARK}`.slice(0, 60);
    try {
      const problem = await submitEdit(page, testCase.route(id), testCase.field, want);
      if (problem !== null) {
        bad(testCase.name, problem);
        continue;
      }
      const stored = await testCase.read(id);
      stored === want
        ? ok(testCase.name, `saved "${stored.slice(0, 44)}"`)
        : bad(testCase.name, `the form redirected as if saved, but the database still reads "${stored}"`);
    } finally {
      await testCase.restore(id, original);
    }
  }

  // ── Add, not just edit ───────────────────────────────────────────────────
  // Creating exercises a path editing does not: the business ID is generated
  // on save, and the redirect goes to a record that did not exist a moment
  // ago. Each row is hard-deleted afterwards — these were never real records,
  // so soft-deleting them would leave rubbish in every report that counts
  // deleted rows.
  type CreateCase = {
    name: string;
    route: string;
    fill: (page: Page) => Promise<void>;
    read: () => Promise<{ id: string; code: string } | null>;
    remove: (id: string) => Promise<void>;
  };

  const creates: CreateCase[] = [
    {
      name: "adding a country",
      route: "/settings/countries/new",
      fill: async (p) => {
        await p.fill('[name="name"]', `Probe Country ${MARK.slice(-6)}`);
        await p.fill('[name="iso2"]', ISO2);
        await p.fill('[name="iso3"]', `${ISO2}Z`);
        await p.fill('[name="dialCode"]', "+999");
        await p.fill('[name="currency"]', "ZZD");
        // Required, and it has no default — leaving it blank makes the browser
        // refuse the submit before the action ever runs, which reads exactly
        // like a broken form if you are not looking for it.
        await p.fill('[name="timezone"]', "Asia/Kolkata");
      },
      read: async () => {
        const row = await prisma.country.findFirst({ where: { name: { contains: MARK.slice(-6) } } });
        return row === null ? null : { id: row.countryId, code: row.countryCode };
      },
      remove: async (id) => void (await prisma.country.delete({ where: { countryId: id } })),
    },
    {
      name: "adding a city",
      route: "/settings/cities/new",
      fill: async (p) => {
        await p.fill('[name="name"]', `Probe City ${MARK.slice(-6)}`);
        await p.fill('[name="state"]', "Probe State");
        // Explicitly a SEEDED country. Left on the default, this lands under
        // whichever country sorts first — which after the case above is the
        // probe's own, and then the country cannot be deleted and outlives the
        // run, so the next run meets the app's duplicate refusal.
        const host = await prisma.country.findFirstOrThrow({
          where: { deletedAt: null, name: { not: { contains: "Probe" } } },
        });
        await p.selectOption('[name="countryId"]', host.countryId).catch(() => undefined);
      },
      read: async () => {
        const row = await prisma.city.findFirst({ where: { name: { contains: MARK.slice(-6) } } });
        return row === null ? null : { id: row.cityId, code: row.cityCode };
      },
      remove: async (id) => void (await prisma.city.delete({ where: { cityId: id } })),
    },
  ];

  // Cities are created under a country, so they are torn down first — a
  // delete that violates a foreign key leaves the parent row behind, and the
  // probe's rubbish then outlives the run.
  for (const testCase of [...creates].reverse()) {
    let created: { id: string; code: string } | null = null;
    try {
      await page.goto(BASE + testCase.route, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("load");
      await testCase.fill(page);
      const before = page.url();
      await page.locator('form button[type="submit"]').last().click();
      await page
        .waitForURL((url) => url.toString() !== before, { timeout: 15000 })
        .catch(() => undefined);

      created = await testCase.read();
      if (created === null) {
        const alert = await page.locator('[role="alert"]').first().innerText().catch(() => "");
        bad(testCase.name, `nothing was created: ${alert.replace(/\s+/g, " ").slice(0, 160) || "no error shown"}`);
        continue;
      }
      // The business ID is generated on save and never typed (invariant 9).
      created.code.length > 0
        ? ok(testCase.name, `created ${created.code}, generated on save`)
        : bad(testCase.name, "created, but with no business ID");
    } finally {
      if (created !== null) await testCase.remove(created.id);
    }
  }

  await browser.close();
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
