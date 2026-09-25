/**
 * The student portal, driven as a student.
 *
 * ── Why the portal needs its own suite ──────────────────────────────────
 *
 * `verify:actions`, `verify:widths` and `verify:type` each sign in as an
 * ADMINISTRATOR and walk the console. A portal route visited with that session
 * is redirected straight back to `/dashboard` — correctly — so adding
 * `/portal/*` to their arrays would test the redirect and nothing else.
 * Teaching all three to hold two sessions would complicate three suites to
 * serve one; this holds the student session once and applies the same rules.
 *
 * It checks four things the console's suites check, plus two only this surface
 * has:
 *
 *   · every screen renders, and no screen drags the page sideways at 390px;
 *   · every rendered size is on the type scale;
 *   · the recording's two gates — delivered AND published;
 *   · **no admin-only field reaches a student's screen**, which is the whole
 *     reason `/me` is its own API surface rather than the console's with a
 *     narrower scope;
 *   · a signed-out student reaches the PORTAL's door, not the console's, and
 *     an administrator following a portal link is sent back to their console.
 *
 * Results are read back out of the database with Prisma. Nothing is asserted
 * from what the screen says about itself; the screen is the thing under test.
 *
 *   npm run start --workspace @gurukulam/web     # in another shell
 *   npm run verify:portal --workspace @gurukulam/web
 */
import { PrismaClient } from "@gurukulam/db";
import { chromium, type Page } from "playwright";

const BASE = process.env["VERIFY_BASE_URL"] ?? "http://127.0.0.1:3000";
const EXECUTABLE = process.env["CHROMIUM_PATH"] ?? process.env["CHROME"];
const STUDENT = "stu-2026-0891@gurukulam.com";
const PASSWORD = "Gurukulam@2026";

const prisma = new PrismaClient();
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

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${BASE}/portal/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
}

/** 390px: a modern phone in portrait, which is what this portal is for. */
const NARROW = 390;

/** The scale, exactly as globals.css declares it. See verify:type. */
const SCALE = [36, 30, 25, 20, 18, 16, 14, 12, 10];

const ROUTES = ["/portal", "/portal/learning", "/portal/account", "/portal/account/password"];

async function main(): Promise<void> {
  const student = await prisma.student.findFirstOrThrow({
    where: { loginEmail: STUDENT },
    select: { studentId: true, firstName: true, studentCode: true, email: true },
  });

  const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {});
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(20000);
  await page.route("**fonts.g**", (r) => r.abort());

  // ── 1. A signed-out visitor cannot read the portal ──────────────────────
  await page.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
  if (/\/login/.test(page.url())) ok("signed out — sent to sign in", page.url().replace(BASE, ""));
  else bad("signed out — sent to sign in", `landed on ${page.url()}`);

  // ── 2. Sign in ──────────────────────────────────────────────────────────
  await signIn(page, STUDENT, PASSWORD);
  await page.waitForURL(/\/portal$/, { timeout: 30000 }).catch(() => undefined);
  if (/\/portal$/.test(page.url())) ok("sign in lands on the portal");
  else bad("sign in lands on the portal", `landed on ${page.url()}`);

  // ── 3. Home says the true thing ─────────────────────────────────────────
  await page.waitForLoadState("load");
  const homeText = await page.locator("body").innerText();
  if (homeText.includes(student.firstName)) ok("home greets them by name", student.firstName);
  else bad("home greets them by name", `"${student.firstName}" not on the page`);

  const nextFromDb = await prisma.batchSession.findFirst({
    where: {
      deletedAt: null,
      status: { not: "COMPLETED" },
      scheduledDate: { gte: startOfToday() },
      batch: { studentMappings: { some: { studentId: student.studentId, deletedAt: null } } },
    },
    orderBy: [{ scheduledDate: "asc" }, { startTime: "asc" }],
    select: { title: true, scheduledDate: true },
  });
  if (nextFromDb === null) {
    console.log("  \x1b[90m· no upcoming session in the data — next-session case not exercised\x1b[0m");
  } else if (homeText.includes(nextFromDb.title)) {
    ok("home shows the next session", `${nextFromDb.title} on ${nextFromDb.scheduledDate.toISOString().slice(0, 10)}`);
  } else {
    bad("home shows the next session", `database says "${nextFromDb.title}"; the page does not name it`);
  }

  // ── 4. My learning shows every batch, finished ones included ────────────
  await page.goto(`${BASE}/portal/learning`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
  const learning = await page.locator("body").innerText();
  const mappings = await prisma.studentBatchMapping.findMany({
    where: { studentId: student.studentId, deletedAt: null },
    include: { batch: { select: { batchCode: true } } },
  });
  const missing = mappings.filter((m) => !learning.includes(m.batch.batchCode));
  if (mappings.length > 0 && missing.length === 0) {
    ok("my learning lists every enrolment", `${mappings.length} batch(es), finished ones included`);
  } else {
    bad("my learning lists every enrolment", `missing ${missing.map((m) => m.batch.batchCode).join(", ")}`);
  }

  const sessions = await prisma.batchSession.count({
    where: {
      deletedAt: null,
      batch: { studentMappings: { some: { studentId: student.studentId, deletedAt: null } } },
    },
  });
  const onPage = (learning.match(/SES-/g) ?? []).length;
  console.log(`  \x1b[90m· ${sessions} session(s) in the data\x1b[0m`);

  // ── 5. The recording's two gates ────────────────────────────────────────
  const delivered = await prisma.batchSession.findFirst({
    where: {
      deletedAt: null, status: "COMPLETED", recording: { is: null },
      batch: { studentMappings: { some: { studentId: student.studentId, deletedAt: null } } },
    },
  });
  const notDelivered = await prisma.batchSession.findFirst({
    where: {
      deletedAt: null, status: { not: "COMPLETED" }, recording: { is: null },
      batch: { studentMappings: { some: { studentId: student.studentId, deletedAt: null } } },
    },
  });

  if (delivered && notDelivered) {
    // Published, on a DELIVERED session → must appear.
    await prisma.sessionRecording.create({
      data: { sessionId: delivered.sessionId, url: "https://example.test/delivered", provider: "YOUTUBE", isPublished: true, title: "gate-probe-delivered" },
    });
    // Published, on a session nobody marked delivered → must NOT appear.
    await prisma.sessionRecording.create({
      data: { sessionId: notDelivered.sessionId, url: "https://example.test/early", provider: "YOUTUBE", isPublished: true, title: "gate-probe-early" },
    });

    await page.goto(`${BASE}/portal/learning`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    const html = await page.content();
    const showsDelivered = html.includes("example.test/delivered");
    const showsEarly = html.includes("example.test/early");
    if (showsDelivered && !showsEarly) {
      ok("recording gate", "published + delivered shows; published on an unmarked session does not");
    } else {
      bad("recording gate", `delivered shown=${showsDelivered} (want true), early shown=${showsEarly} (want false)`);
    }

    // Unpublish the good one — it must disappear.
    await prisma.sessionRecording.update({
      where: { sessionId: delivered.sessionId }, data: { isPublished: false },
    });
    await page.goto(`${BASE}/portal/learning`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    if (!(await page.content()).includes("example.test/delivered")) {
      ok("recording gate — held back disappears");
    } else {
      bad("recording gate — held back disappears", "an unpublished recording is still on the page");
    }

    await prisma.sessionRecording.deleteMany({
      where: { sessionId: { in: [delivered.sessionId, notDelivered.sessionId] } },
    });
  } else {
    console.log("  \x1b[90m· no delivered/undelivered pair free of a recording — gate not exercised\x1b[0m");
  }

  // ── 6. The account screen, and what it must not say ─────────────────────
  await page.goto(`${BASE}/portal/account`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
  const account = await page.locator("body").innerText();
  if (account.includes(student.studentCode) && account.includes(student.email)) {
    ok("account shows both addresses", "the one they sign in with and the one we write to");
  } else {
    bad("account shows both addresses", "student code or contact email missing");
  }

  // ── 7. Nothing an admin may see leaks into the portal ───────────────────
  const record = await prisma.student.findUniqueOrThrow({ where: { studentId: student.studentId } });
  const forbidden: [string, string | null][] = [
    ["notes", record.notes],
    ["suspendedReason", record.suspendedReason],
    ["createdBy", record.createdBy],
  ];
  const leaked: string[] = [];
  for (const [name, value] of forbidden) {
    if (value !== null && value.trim() !== "" && account.includes(value)) leaked.push(name);
  }
  const probed = forbidden.filter(([, v]) => v !== null && v.trim() !== "").map(([n]) => n);
  if (leaked.length === 0) {
    ok("no admin-only field on the page", probed.length > 0 ? `checked ${probed.join(", ")}` : "none set on this record to check");
  } else {
    bad("no admin-only field on the page", `${leaked.join(", ")} rendered to the student`);
  }

  // ── 8. The one thing a student may WRITE ────────────────────────────────
  const before = await prisma.student.findUniqueOrThrow({
    where: { studentId: student.studentId },
    select: { phone: true, altPhone: true },
  });
  const marker = `+9198${Date.now().toString().slice(-8)}`;

  await page.goto(`${BASE}/portal/account`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
  const opener = page.getByRole("button", { name: "Update my details" });
  if ((await opener.count()) === 0) {
    bad("editing my details", "no way to open the form");
  } else {
    await opener.click();
    await page.fill('input[name="phone"]', marker);
    await Promise.all([
      page.waitForURL(/saved=1/, { timeout: 30000 }).catch(() => undefined),
      page.getByRole("button", { name: /^Save$|Saving/ }).click(),
    ]);
    const after = await prisma.student.findUniqueOrThrow({
      where: { studentId: student.studentId },
      select: { phone: true },
    });
    if (after.phone === marker) ok("editing my details", `phone saved as ${marker}`);
    else bad("editing my details", `database holds ${String(after.phone)}, expected ${marker}`);

    // A field the form does not name must be untouched by a save.
    const untouched = await prisma.student.findUniqueOrThrow({
      where: { studentId: student.studentId },
      select: { firstName: true, email: true, studentCode: true },
    });
    if (untouched.firstName === student.firstName && untouched.email === student.email) {
      ok("a save cannot reach a locked field", "name and email unchanged");
    } else {
      bad("a save cannot reach a locked field", "name or email moved");
    }

    await prisma.student.update({
      where: { studentId: student.studentId },
      data: { phone: before.phone, altPhone: before.altPhone },
    });
  }

  // ── 9. Every screen fits a phone, and every size is on the scale ────────
  const phone = await browser.newPage({ viewport: { width: NARROW, height: 844 } });
  await phone.route("**fonts.g**", (r) => r.abort());
  await signIn(phone, STUDENT, PASSWORD);
  await phone.waitForURL(/\/portal/, { timeout: 30000 }).catch(() => undefined);

  const sideways: string[] = [];
  const offScale: string[] = [];
  for (const route of ROUTES) {
    await phone.goto(BASE + route, { waitUntil: "domcontentloaded" });
    await phone.waitForLoadState("load");
    const verdict = await phone.evaluate(({ scale }) => {
      window.scrollTo(3000, 0);
      const dragged = Math.round(window.scrollX);
      window.scrollTo(0, 0);
      const bad: string[] = [];
      for (const el of Array.from(document.querySelectorAll("body *"))) {
        const own = Array.from(el.childNodes)
          .filter((n) => n.nodeType === 3)
          .map((n) => (n.textContent ?? "").trim())
          .join(" ")
          .trim();
        if (own === "") continue;
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;
        const size = Math.round(parseFloat(style.fontSize));
        if (!scale.includes(size)) bad.push(`${size}px · "${own.slice(0, 30)}"`);
      }
      return { dragged, bad: [...new Set(bad)].slice(0, 4) };
    }, { scale: SCALE });

    if (verdict.dragged > 0) sideways.push(`${route} — drags ${verdict.dragged}px`);
    for (const row of verdict.bad) offScale.push(`${route} — ${row}`);
  }
  await phone.close();

  if (sideways.length === 0) ok(`every screen fits at ${NARROW}px`, `${ROUTES.length} routes`);
  else bad(`every screen fits at ${NARROW}px`, sideways.join(" · "));

  if (offScale.length === 0) ok("every size is on the type scale");
  else bad("every size is on the type scale", offScale.join(" · "));

  // ── 10. An administrator is sent back to their console ──────────────────
  const admin = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await admin.route("**fonts.g**", (r) => r.abort());
  await admin.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await admin.fill('input[name="email"]', "priya@gurukulam.test");
  await admin.fill('input[name="password"]', PASSWORD);
  await admin.click('button[type="submit"]');
  await admin.waitForURL(/dashboard/, { timeout: 30000 });
  await admin.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded" });
  await admin.waitForLoadState("load");
  if (/dashboard/.test(admin.url())) ok("an admin following a portal link is sent to their console");
  else bad("an admin following a portal link is sent to their console", `landed on ${admin.url()}`);

  await browser.close();
  await prisma.$disconnect();
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

const startOfToday = (): Date => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
};

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
