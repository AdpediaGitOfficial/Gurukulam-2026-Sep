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
import { formatRupees } from "@gurukulam/contracts";

/** The screen's own formatter, so a mismatch is a real one and not a rounding difference. */
const rupees = (minor: bigint): string => formatRupees(minor, { paise: false });

const BASE = process.env["VERIFY_BASE_URL"] ?? "http://127.0.0.1:3000";
const EXECUTABLE = process.env["CHROMIUM_PATH"] ?? process.env["CHROME"];
const STUDENT = "stu-2026-0891@gurukulam.com";
/** A COLLEGE student, to prove Fees is absent rather than empty for them. */
const COLLEGE_STUDENT = process.env["VERIFY_COLLEGE_STUDENT"] ?? "stu-2026-0003@gurukulam.com";
const PASSWORD = "Gurukulam@2026";
/**
 * The API, reached directly for the two checks a browser cannot make.
 *
 * Every other assertion here drives the screen, which is the right default.
 * But "an assignment on somebody else's batch is not yours to submit to" has
 * no control to click — the whole point is that the portal never renders one —
 * so it is exercised where the refusal lives.
 */
const API = process.env["API_INTERNAL_URL"] ?? "http://127.0.0.1:4000/api/v1";

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
  /*
   * Waited on the PATHNAME, not on a regex.
   *
   * `/\/portal/` also matches `/portal/login`, so an earlier version resolved
   * the moment the click was registered and left every later assertion running
   * against the sign-in screen. The college-student nav check then passed
   * because a login page has no navigation — a vacuous pass, which is worse
   * than a failure: it reports that a rule holds on a screen that never
   * rendered.
   */
  await page
    .waitForURL((url) => url.pathname === "/portal", { timeout: 30000 })
    .catch(() => undefined);
}

/** 390px: a modern phone in portrait, which is what this portal is for. */
const NARROW = 390;

/** The scale, exactly as globals.css declares it. See verify:type. */
const SCALE = [36, 30, 25, 20, 18, 16, 14, 12, 10];

const ROUTES = [
  "/portal",
  "/portal/learning",
  "/portal/assignments",
  "/portal/fees",
  "/portal/account",
  "/portal/account/password",
];

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

  // ── 9. Money: the figures are the database's, to the paise ──────────────
  const ledgers = await prisma.studentFeeLedger.findMany({
    where: { studentId: student.studentId, deletedAt: null },
    include: { installments: { where: { deletedAt: null } } },
  });

  if (ledgers.length === 0) {
    console.log("  \x1b[90m· this student has no ledger — the fees figures are not exercised\x1b[0m");
  } else {
    await page.goto(`${BASE}/portal/fees`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    const feesText = (await page.locator("body").innerText()).replace(/\u00a0/g, " ");

    // Summed in bigint, exactly as the API does. A float here would agree with
    // a float bug rather than catch one.
    let paid = 0n;
    let outstanding = 0n;
    for (const ledger of ledgers) {
      paid += ledger.totalPaidMinor;
      outstanding += ledger.balancePendingMinor;
    }
    const shown = [rupees(paid), rupees(outstanding)];
    const missing = shown.filter((amount) => !feesText.includes(amount));
    if (missing.length === 0) {
      ok("fees show the database's figures", `${shown[0]} paid, ${shown[1]} outstanding`);
    } else {
      bad("fees show the database's figures", `page does not contain ${missing.join(" or ")}`);
    }

    // Every instalment appears, whatever its state — a paid one is how a
    // student checks that the money they sent was recorded.
    // Counted inside the ledger sections: the Money card's caption also reads
    // "Installment 2 of 4", and counting it made four instalments look like
    // five.
    const count = ledgers.reduce((n, l) => n + l.installments.length, 0);
    const listed = await page.evaluate(() =>
      Array.from(document.querySelectorAll("section[aria-labelledby]"))
        .map((section) => (section.textContent ?? "").match(/Installment \d+ of \d+/g)?.length ?? 0)
        .reduce((a, b) => a + b, 0),
    );
    if (listed === count) ok("every instalment is listed", `${count}`);
    else bad("every instalment is listed", `database has ${count}, the page shows ${listed}`);
  }

  // ── 9b. Assignments: what is shown, what is withheld, and the write ─────
  const allAssignments = await prisma.assignment.findMany({
    where: {
      deletedAt: null,
      batch: { studentMappings: { some: { studentId: student.studentId, deletedAt: null } } },
    },
    select: { assignmentId: true, assignmentCode: true, title: true, status: true, dueAt: true },
  });
  const released = allAssignments.filter((a) => a.status !== "DRAFT");
  const drafts = allAssignments.filter((a) => a.status === "DRAFT");

  if (released.length === 0) {
    console.log("  \x1b[90m· no released assignment on this student's batches — not exercised\x1b[0m");
  } else {
    await page.goto(`${BASE}/portal/assignments`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    const work = await page.locator("body").innerText();

    const absent = released.filter((a) => !work.includes(a.assignmentCode));
    if (absent.length === 0) {
      ok(
        "every released assignment is on the page",
        `${released.length}, closed ones included`,
      );
    } else {
      bad(
        "every released assignment is on the page",
        `missing ${absent.map((a) => a.assignmentCode).join(", ")}`,
      );
    }

    // A DRAFT is work nobody has decided to set. Showing one sets it.
    if (drafts.length === 0) {
      console.log("  \x1b[90m· no DRAFT assignment in the data — the withholding is not exercised\x1b[0m");
    } else {
      const leaked = drafts.filter(
        (a) => work.includes(a.assignmentCode) || work.includes(a.title),
      );
      if (leaked.length === 0) {
        ok("a draft assignment is withheld", `${drafts.length} draft(s) on their batches`);
      } else {
        bad("a draft assignment is withheld", `${leaked.map((a) => a.assignmentCode).join(", ")} rendered`);
      }
    }

    // Overdue is computed at read time, so it has to be true on the screen the
    // morning after the date — not after a nightly run touches a column.
    const lateOne = await prisma.assignment.findFirst({
      where: {
        deletedAt: null, status: "OPEN", dueAt: { lt: startOfToday() },
        batch: { studentMappings: { some: { studentId: student.studentId, deletedAt: null } } },
        submissions: { none: { studentId: student.studentId, deletedAt: null, submittedAt: { not: null } } },
      },
      select: { assignmentCode: true },
    });
    if (lateOne === null) {
      console.log("  \x1b[90m· nothing past its date and unsubmitted — overdue not exercised\x1b[0m");
    } else {
      const card = await cardText(page, lateOne.assignmentCode);
      if (/overdue/i.test(card) && /Was due/i.test(card)) {
        ok("past its date reads as overdue", lateOne.assignmentCode);
      } else {
        bad("past its date reads as overdue", `${lateOne.assignmentCode} card says: ${card.slice(0, 120)}`);
      }
    }

    // ── The write ─────────────────────────────────────────────────────────
    const toHandIn = await prisma.assignment.findFirst({
      where: {
        deletedAt: null, status: "OPEN",
        batch: { studentMappings: { some: { studentId: student.studentId, deletedAt: null } } },
        submissions: { none: { studentId: student.studentId, deletedAt: null } },
      },
      select: { assignmentId: true, assignmentCode: true },
    });

    if (toHandIn === null) {
      console.log("  \x1b[90m· nothing open and unsubmitted — handing in is not exercised\x1b[0m");
    } else {
      const marker = `https://example.test/work/${Date.now()}`;
      const card = page.locator("li").filter({ hasText: toHandIn.assignmentCode }).last();
      const opener = card.getByRole("button", { name: "Hand it in" });

      if ((await opener.count()) === 0) {
        bad("handing work in", `no Hand it in control on ${toHandIn.assignmentCode}`);
      } else {
        await opener.click();
        await card.locator('input[name="fileUrl"]').fill(marker);
        await Promise.all([
          page.waitForURL(/handed-in=/, { timeout: 30000 }).catch(() => undefined),
          card.getByRole("button", { name: /^Hand it in$|Sending/ }).click(),
        ]);

        // Read back out of the database. The screen is the thing under test.
        const row = await prisma.assignmentSubmission.findFirst({
          where: { assignmentId: toHandIn.assignmentId, studentId: student.studentId, deletedAt: null },
        });
        if (row?.fileUrl === marker && row.submittedAt !== null) {
          ok("handing work in", `${toHandIn.assignmentCode} → ${row.status}`);
        } else {
          bad("handing work in", `database holds ${JSON.stringify(row?.fileUrl ?? null)}`);
        }

        await page.waitForLoadState("load");
        const after = await cardText(page, toHandIn.assignmentCode);
        if (/That is in/i.test(after) && after.includes(marker)) {
          ok("and the screen confirms that one", "named, not a generic banner");
        } else {
          bad("and the screen confirms that one", after.slice(0, 160));
        }

        /*
         * The double tap.
         *
         * A student on a slow connection presses twice; both requests read "no
         * submission yet" and both insert. A read-then-write cannot be made
         * safe in process, so the guard is the partial unique index — and this
         * is the check that it is actually there. Written straight at the
         * database rather than through the portal, because the race cannot be
         * reproduced by clicking.
         */
        let refused = false;
        try {
          await prisma.assignmentSubmission.create({
            data: {
              assignmentId: toHandIn.assignmentId,
              studentId: student.studentId,
              status: "SUBMITTED",
              submittedAt: new Date(),
              fileUrl: "https://example.test/second-tap",
            },
          });
        } catch {
          refused = true;
        }
        if (refused) {
          ok("a second submission is refused", "one student, one hand-in");
        } else {
          bad("a second submission is refused", "two live submissions now exist for one student");
        }
        await prisma.assignmentSubmission.deleteMany({
          where: { assignmentId: toHandIn.assignmentId, studentId: student.studentId },
        });
      }
    }

    // ── Somebody else's work is not theirs to hand in ─────────────────────
    const otherBatch = await prisma.batch.findFirst({
      where: {
        deletedAt: null,
        studentMappings: { none: { studentId: student.studentId, deletedAt: null } },
      },
      select: { batchId: true, batchCode: true },
    });

    if (otherBatch === null) {
      console.log("  \x1b[90m· this student is on every batch — the scope check is vacuous\x1b[0m");
    } else {
      const foreign = await prisma.assignment.create({
        data: {
          assignmentCode: `ASG-PROBE-${Date.now().toString().slice(-6)}`,
          batchId: otherBatch.batchId,
          title: "scope-probe — another batch's work",
          status: "OPEN",
        },
        select: { assignmentId: true, assignmentCode: true },
      });

      const login = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `actor` is part of the credential — the same address can exist on two
        // surfaces, so a login without it is an ADMIN login and is refused.
        body: JSON.stringify({ email: STUDENT, password: PASSWORD, actor: "STUDENT" }),
      });
      const token = ((await login.json()) as { tokens?: { accessToken?: string } }).tokens?.accessToken;

      if (token === undefined) {
        bad("another batch's assignment is out of reach", "could not sign the student in at the API");
      } else {
        const listed = (await (
          await fetch(`${API}/me/assignments`, { headers: { Authorization: `Bearer ${token}` } })
        ).text()).includes(foreign.assignmentCode);

        const refusal = await fetch(`${API}/me/assignments/${foreign.assignmentId}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ fileUrl: "https://example.test/not-mine" }),
        });

        const wrote = await prisma.assignmentSubmission.count({
          where: { assignmentId: foreign.assignmentId, deletedAt: null },
        });

        if (!listed && refusal.status === 404 && wrote === 0) {
          ok("another batch's assignment is out of reach", "unlisted, and a submit reads as not found");
        } else {
          bad(
            "another batch's assignment is out of reach",
            `listed=${listed} status=${refusal.status} (want 404) rows=${wrote}`,
          );
        }
      }

      await prisma.assignmentSubmission.deleteMany({ where: { assignmentId: foreign.assignmentId } });
      await prisma.assignment.delete({ where: { assignmentId: foreign.assignmentId } });
    }
  }

  // ── 10. Invariant 3: absent for a college student, not empty ────────────
  const college = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await college.route("**fonts.g**", (r) => r.abort());
  await signIn(college, COLLEGE_STUDENT, PASSWORD);
  await college.waitForLoadState("load");

  // Asserted against a navigation that EXISTS, so "no Fees entry" cannot be
  // satisfied by a screen that has no entries at all.
  const collegeEntries = await college.locator('nav[aria-label="Sections"] a').count();
  const collegeNav = await college.locator('nav[aria-label="Sections"] a[href="/portal/fees"]').count();
  if (collegeEntries === 0) {
    bad("a college student has no Fees entry", `not signed in — landed on ${college.url()}`);
  } else if (collegeNav === 0) {
    ok("a college student has no Fees entry", `absent from ${collegeEntries} entries, not disabled`);
  } else {
    bad("a college student has no Fees entry", "Fees is in their navigation");
  }

  // Typed or bookmarked, the URL still has to answer honestly.
  await college.goto(`${BASE}/portal/fees`, { waitUntil: "domcontentloaded" });
  await college.waitForLoadState("load");
  const collegeText = await college.locator("body").innerText();
  const explains = /billed to your college/i.test(collegeText);
  const showsMoney = /Paid so far|Outstanding|Installment \d+ of/i.test(collegeText);
  if (explains && !showsMoney) {
    ok("and the URL explains rather than showing zero", "invariant 3, as a screen");
  } else {
    bad(
      "and the URL explains rather than showing zero",
      `explains=${explains} showsMoney=${showsMoney}`,
    );
  }
  await college.close();

  // ── 11. Every screen fits a phone, and every size is on the scale ───────
  const phone = await browser.newPage({ viewport: { width: NARROW, height: 844 } });
  await phone.route("**fonts.g**", (r) => r.abort());
  await signIn(phone, STUDENT, PASSWORD);

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

  // ── 12. An administrator is sent back to their console ──────────────────
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

/**
 * The text of one assignment's card, found by the code printed on it.
 *
 * Scoped rather than searched across the whole page: "overdue" appearing
 * SOMEWHERE while three assignments are on screen says nothing about which one
 * is overdue, and a check that cannot fail is not a check.
 */
async function cardText(page: Page, assignmentCode: string): Promise<string> {
  const card = page.locator("li").filter({ hasText: assignmentCode }).last();
  if ((await card.count()) === 0) return "";
  return (await card.innerText()).replace(/\u00a0/g, " ");
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
