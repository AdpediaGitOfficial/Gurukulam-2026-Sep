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
    /* `.trim()` because the contract trims: a record whose field is null gives
       an `original` of "", and the expectation would otherwise carry a leading
       space the API correctly strips — which reads as a failed save when the
       save was perfect. Whether that happens depends on which row
       `findFirstOrThrow` returns, so it surfaced as a flake. */
    const want = `${original.slice(0, 20)} ${MARK}`.trim().slice(0, 60);
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

  await registerChecks(page);
  await markingChecks(page);

  await browser.close();
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exitCode = failed === 0 ? 0 : 1;
}

/**
 * Marking a submission from the CONSOLE.
 *
 * ── Why this belongs in the forms suite ────────────────────────────────
 *
 * It is a console form that writes, which is what this file exercises — and it
 * is the form that did not exist. `POST /batches/submissions/:id/grade` was
 * reachable only from the trainer portal: an operator could not mark, could not
 * see a submission at all, and the assignment row offered Edit and Delete. That
 * breaks the rule the product is arranged around, on the one act a student
 * chases.
 *
 * ── What is MANUFACTURED, and why ──────────────────────────────────────
 *
 * Both real submissions in the seed carry no `content_text`, so "the marker can
 * read the answer" would pass on an empty string — the same vacuous shape as a
 * certificate check run with every `pdf_url` null. The text is written for the
 * length of the check and put back.
 */
async function markingChecks(page: Page): Promise<void> {
  const WORK = "SELECT a.id FROM a JOIN b ON b.a_id = a.id\n-- a second line, kept as written";
  const since = new Date();

  const held = await prisma.assignmentSubmission.findFirst({
    where: { deletedAt: null, submittedAt: { not: null }, assignment: { maxMarks: { not: null } } },
    include: {
      assignment: { select: { assignmentId: true, maxMarks: true } },
      student: { select: { studentId: true } },
    },
  });

  /*
   * Written if there is none, because the seed creates no submissions at all and
   * `verify:portal` deletes the one it hands in. A check that waits for a real
   * row to be lying about passes or skips depending on what the last run left
   * behind, which is not a check — and on a freshly seeded database this one
   * failed for want of data rather than for want of a feature.
   */
  const invented =
    held !== null
      ? null
      : await manufactureSubmission(WORK);
  const submission = held ?? invented;
  if (submission === null || submission.assignment.maxMarks === null) {
    bad("an operator can mark a submission", "no assignment with a ceiling has anybody on its roster");
    return;
  }

  const ceiling = submission.assignment.maxMarks;
  const before = {
    marksAwarded: submission.marksAwarded,
    feedback: submission.feedback,
    gradedBy: submission.gradedBy,
    gradedAt: submission.gradedAt,
    status: submission.status,
    contentText: submission.contentText,
  };
  // A mark that is legal, different from whatever is there, and inside the
  // ceiling — so a pass cannot be the value that was already stored.
  const target = before.marksAwarded === 7 ? 6 : 7;

  try {
    await prisma.assignmentSubmission.update({
      where: { submissionId: submission.submissionId },
      data: { contentText: WORK },
    });

    await page.goto(`${BASE}/batches/assignments/${submission.assignment.assignmentId}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("load");
    /*
     * Waited on THIS form, not on the first one on the page.
     *
     * `querySelector("form")` is the top bar's search, which hydrates early — so
     * a wait on it passed while the mark form was still bare, the click did
     * nothing, and the probe then read a database nothing had written. The same
     * island-by-island race `verify:actions` had, found three times in one day.
     */
    await page
      .waitForFunction(() => {
        const form = document.querySelector('input[name="marksAwarded"]')?.closest("form") ?? null;
        return form !== null && Object.keys(form).some((k) => k.startsWith("__reactProps$"));
      }, undefined, { timeout: 15000 })
      .catch(() => undefined);

    const shown = await page.locator("body").innerText();
    if (shown.includes("a second line, kept as written")) {
      ok("the work is on the screen of whoever marks it", "line breaks and all");
    } else {
      // `content_text` reached no contract but the student's own until this
      // screen was built, so a trainer was asked to mark work they could not read.
      bad("the work is on the screen of whoever marks it", "the submitted text is not rendered");
    }

    // ── The ceiling, enforced where it is typed ──────────────────────────
    const field = page.locator('input[name="marksAwarded"]').first();
    await field.fill(String(ceiling + 5));
    const verdict = await field.evaluate((element: HTMLInputElement) => ({
      max: element.max,
      valid: element.checkValidity(),
    }));
    if (verdict.max === String(ceiling) && !verdict.valid) {
      ok("a mark above the ceiling cannot even be submitted", `max=${verdict.max}, the browser refuses it`);
    } else {
      bad(
        "a mark above the ceiling cannot even be submitted",
        `max=${verdict.max || "(none)"}, valid=${verdict.valid}`,
      );
    }

    // And independently at the API, because another client can post anything.
    const token = await apiToken();
    const refused = await fetch(
      `${API}/batches/submissions/${submission.submissionId}/grade`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ marksAwarded: ceiling + 5 }),
      },
    );
    const body = (await refused.json()) as { error?: { fields?: Record<string, string> } };
    const unmoved = await prisma.assignmentSubmission.findUniqueOrThrow({
      where: { submissionId: submission.submissionId },
      select: { marksAwarded: true },
    });
    if (
      refused.status === 400 &&
      (body.error?.fields?.["marksAwarded"] ?? "").includes(String(ceiling)) &&
      unmoved.marksAwarded === before.marksAwarded
    ) {
      ok("…and the API refuses it too, by name", `"${body.error?.fields?.["marksAwarded"] ?? ""}"`);
    } else {
      bad(
        "…and the API refuses it too, by name",
        `status ${refused.status}, fields ${JSON.stringify(body.error?.fields)}, marks now ${unmoved.marksAwarded}`,
      );
    }

    // ── A legal mark, through the form ──────────────────────────────────
    await field.fill(String(target));
    await page.locator('textarea[name="feedback"]').first().fill("Clear work — look at the joins again.");
    await page.getByRole("button", { name: /save the mark|replace the mark/i }).first().click();

    /*
     * Polled from the DATABASE rather than waited for on screen.
     *
     * A server action posts and revalidates without navigating, so neither
     * `networkidle` nor the success alert proved reliable to wait on — one probe
     * read 18 from the database while the student's own notice already said 7.
     * The row changing is the thing that has to happen, so that is what is
     * waited for.
     */
    const graded = await poll(
      () =>
        prisma.assignmentSubmission.findUniqueOrThrow({
          where: { submissionId: submission.submissionId },
          select: { marksAwarded: true, feedback: true, gradedBy: true, status: true },
        }),
      (row) => row.marksAwarded === target,
    );
    const marker = await prisma.adminUser.findFirst({
      where: { adminUserId: graded.gradedBy ?? "" },
      select: { name: true },
    });

    if (graded.marksAwarded === target && graded.status === "GRADED" && marker !== null) {
      ok(
        "an operator can mark a submission",
        `${target} of ${ceiling}, attributed to ${marker.name}`,
      );
    } else {
      bad(
        "an operator can mark a submission",
        `marks ${graded.marksAwarded}, status ${graded.status}, gradedBy ${graded.gradedBy ?? "null"}`,
      );
    }

    // The student is told, from inside the same transaction as the mark.
    const notice = await poll(
      () =>
        prisma.notification.findFirst({
          where: { recipientType: "STUDENT", recipientId: submission.student.studentId },
          orderBy: { createdAt: "desc" },
          select: { body: true, createdAt: true },
        }),
      (row) => (row?.body ?? "").includes(`${target} out of ${ceiling}`),
    );
    if ((notice?.body ?? "").includes(`${target} out of ${ceiling}`)) {
      ok("…and the student is told what they got", notice?.body ?? "");
    } else {
      bad("…and the student is told what they got", `latest notice: ${notice?.body ?? "none"}`);
    }
  } finally {
    /* Put back in a `finally`: a failed assertion above would otherwise leave a
       mark this suite invented on a real student's work, and the next run would
       measure that. A row this run WROTE goes away entirely. */
    if (invented !== null) {
      await prisma.assignmentSubmission.delete({ where: { submissionId: submission.submissionId } });
    } else {
      await prisma.assignmentSubmission.update({
        where: { submissionId: submission.submissionId },
        data: before,
      });
    }
    /* And the notice the mark emitted. It is real news about a grade that no
       longer exists, and a student's bell is not a scratch pad. */
    await prisma.notification.deleteMany({
      where: {
        recipientType: "STUDENT",
        recipientId: submission.student.studentId,
        type: "assignment.graded",
        createdAt: { gte: since },
      },
    });
  }
}

/**
 * A hand-in to mark, written straight at the table.
 *
 * The allocation and submit paths have their own suites; what this file needs is
 * a row in the state a marker meets, on an assignment that carries a ceiling and
 * a student who is really on that batch's roster.
 */
async function manufactureSubmission(work: string) {
  const assignment = await prisma.assignment.findFirst({
    where: {
      deletedAt: null,
      maxMarks: { not: null },
      status: { in: ["OPEN", "CLOSED"] },
      batch: { studentMappings: { some: { deletedAt: null, isActive: true } } },
    },
    select: { assignmentId: true, maxMarks: true, batchId: true },
  });
  if (assignment === null) return null;

  const onRoster = await prisma.studentBatchMapping.findFirst({
    where: {
      batchId: assignment.batchId,
      deletedAt: null,
      isActive: true,
      student: { submissions: { none: { assignmentId: assignment.assignmentId, deletedAt: null } } },
    },
    select: { studentId: true },
  });
  if (onRoster === null) return null;

  const row = await prisma.assignmentSubmission.create({
    data: {
      assignmentId: assignment.assignmentId,
      studentId: onRoster.studentId,
      status: "SUBMITTED",
      submittedAt: new Date(),
      contentText: work,
      createdBy: onRoster.studentId,
    },
    include: {
      assignment: { select: { assignmentId: true, maxMarks: true } },
      student: { select: { studentId: true } },
    },
  });
  return row;
}

/**
 * Taking a register from the CONSOLE.
 *
 * ── Why this check exists ──────────────────────────────────────────────
 *
 * `verify:coverage`, once it could tell the console from a portal, found that
 * `POST /batches/sessions/:id/attendance` had exactly one caller and it was in
 * `/teach`. An operations team could not take or correct a register at all —
 * and attendance is what the certificate floor is judged on, so a cohort whose
 * trainer forgot had no way to be given one.
 *
 * ── Why it asserts on the whole roster, and on the marker ───────────────
 *
 * The register is written whole, because a half-taken one is indistinguishable
 * from one where everybody else was absent. And `marked_by` holds an ADMIN id
 * here where the trainer suite sees a trainer id — the same column, two actors,
 * which is exactly the thing a single-actor check cannot see.
 */
async function registerChecks(page: Page): Promise<void> {
  const session = await prisma.batchSession.findFirst({
    where: {
      deletedAt: null,
      status: { not: "CANCELLED" },
      scheduledDate: { lte: new Date() },
      batch: { studentMappings: { some: { deletedAt: null, isActive: true } } },
    },
    select: { sessionId: true, sessionCode: true, batchId: true },
    orderBy: { scheduledDate: "desc" },
  });
  if (session === null) {
    bad("an operator can take a register", "no past session with a roster to take one on");
    return;
  }

  const roster = await prisma.studentBatchMapping.findMany({
    where: { batchId: session.batchId, deletedAt: null, isActive: true },
    select: { studentId: true },
  });
  const rosterIds = new Set(roster.map((row) => row.studentId));
  const before = await prisma.studentAttendance.findMany({
    where: { sessionId: session.sessionId },
    select: { attendanceId: true, status: true },
  });
  const known = new Set(before.map((row) => row.attendanceId));

  try {
    await page.goto(`${BASE}/batches/sessions/${session.sessionId}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("load");
    // This form's own island, for the reason recorded on the marking check.
    const control = 'select[name^="status:"]';
    await page
      .waitForFunction(
        (selector: string) => {
          const form = document.querySelector(selector)?.closest("form") ?? null;
          return form !== null && Object.keys(form).some((k) => k.startsWith("__reactProps$"));
        },
        control,
        { timeout: 15000 },
      )
      .catch(() => undefined);

    if ((await page.locator(control).count()) === 0) {
      bad("an operator can take a register", "no register control on the console's session screen");
      return;
    }

    // One exception, the rest left at their default — which is the shape of the
    // job, and the only way to tell "the whole register was written" from "the
    // row somebody touched was written".
    await page.locator(control).first().selectOption("LATE");
    await page.getByRole("button", { name: /save the register|correct the register/i }).click();

    const after = await poll(
      () =>
        prisma.studentAttendance.findMany({
          where: { sessionId: session.sessionId, deletedAt: null },
          select: { studentId: true, status: true, markedBy: true, markedAt: true },
        }),
      (rows) =>
        rows.filter((row) => rosterIds.has(row.studentId)).length === rosterIds.size &&
        rows.some((row) => row.status === "LATE"),
    );
    const mine = after.filter((row) => rosterIds.has(row.studentId));
    const marker = await prisma.adminUser.findFirst({
      where: { adminUserId: mine[0]?.markedBy ?? "" },
      select: { name: true },
    });

    if (
      mine.length === rosterIds.size &&
      mine.filter((row) => row.status === "LATE").length === 1 &&
      marker !== null &&
      mine.every((row) => row.markedAt !== null)
    ) {
      ok(
        "an operator can take a register",
        `${session.sessionCode} → ${mine.length} of ${rosterIds.size} marked by ${marker.name}, one LATE`,
      );
    } else {
      bad(
        "an operator can take a register",
        `${mine.length} of ${rosterIds.size} rows, ${mine.filter((r) => r.status === "LATE").length} LATE, marker ${marker?.name ?? mine[0]?.markedBy ?? "none"}`,
      );
    }
  } finally {
    /* Deleted, not just restored: the rows this run CREATED have to go, or the
       next run measures the leftovers. That mistake cost the trainer suite two
       false failures. */
    await prisma.studentAttendance.deleteMany({
      where: { sessionId: session.sessionId, attendanceId: { notIn: [...known] } },
    });
    for (const row of before) {
      await prisma.studentAttendance.update({
        where: { attendanceId: row.attendanceId },
        data: { status: row.status },
      });
    }
  }
}

/** The API, for the checks a browser cannot make. */
const API = process.env["API_INTERNAL_URL"] ?? "http://127.0.0.1:4000/api/v1";

async function apiToken(): Promise<string> {
  const response = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, actor: "ADMIN_USER" }),
  });
  return ((await response.json()) as { tokens?: { accessToken?: string } }).tokens?.accessToken ?? "";
}

/** Reads until it reads what it is waiting for, or twenty seconds pass. */
async function poll<T>(read: () => Promise<T>, want: (value: T) => boolean, ms = 20000): Promise<T> {
  const until = Date.now() + ms;
  let last = await read();
  while (!want(last) && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    last = await read();
  }
  return last;
}


main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
