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
import { PrismaClient, type Prisma } from "@gurukulam/db";
import { chromium, type Browser, type Page } from "playwright";
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
  "/portal/learning/attendance",
  "/portal/assignments",
  "/portal/certificates",
  "/portal/jobs",
  "/portal/notifications",
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

  // ── 9c. Certificates: the code, the withheld draft, and the withdrawal ──
  const issued = await prisma.certificate.findMany({
    where: { studentId: student.studentId, deletedAt: null, status: "ISSUED" },
    select: { certificateNumber: true, verificationCode: true, pdfUrl: true },
  });

  await page.goto(`${BASE}/portal/certificates`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
  const awards = await page.locator("body").innerText();

  if (issued.length === 0) {
    console.log("  \x1b[90m· this student holds no issued certificate — not exercised\x1b[0m");
  } else {
    const missing = issued.filter(
      (c) => !awards.includes(c.certificateNumber) || !awards.includes(c.verificationCode),
    );
    if (missing.length === 0) {
      ok("certificates show their number and code", `${issued.length}, code included`);
    } else {
      bad(
        "certificates show their number and code",
        `missing for ${missing.map((c) => c.certificateNumber).join(", ")}`,
      );
    }

    /*
     * A retail student is the one who MAY download, so their page must not
     * carry the college sentence — and must not offer a link when there is no
     * file behind it either. Both are the same failure: a control or a claim
     * the product cannot honour.
     */
    const claimsCollege = /collects and issues|placement office/i.test(awards);
    const offersFile = /Download the certificate/i.test(awards);
    const anyPdf = issued.some((c) => c.pdfUrl !== null);
    if (!claimsCollege && offersFile === anyPdf) {
      ok(
        "a retail student is not told their college holds it",
        anyPdf ? "and the download is offered" : "and no download is offered with no file behind it",
      );
    } else {
      bad(
        "a retail student is not told their college holds it",
        `collegeSentence=${claimsCollege} offersDownload=${offersFile} pdfExists=${anyPdf}`,
      );
    }

    /*
     * The download, with a file actually behind it.
     *
     * S3 is not integrated, so every `pdf_url` in the data is null — which makes
     * "no download link" true for the wrong reason, and a check that is true for
     * the wrong reason cannot fail when the rule breaks. So a URL is put there
     * for the length of this check and taken away again. It is the only way to
     * assert that a RETAIL student is offered their own file, and the only way
     * the college half of invariant 7 below says anything at all.
     */
    const pdfProbe = `https://example.test/pdf/${Date.now()}`;
    const target = await prisma.certificate.findFirst({
      where: { studentId: student.studentId, deletedAt: null, status: "ISSUED" },
      select: { certificateId: true, pdfUrl: true },
    });
    if (target !== null) {
      await prisma.certificate.update({
        where: { certificateId: target.certificateId },
        data: { pdfUrl: pdfProbe },
      });
      await page.goto(`${BASE}/portal/certificates`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("load");
      const html = await page.content();
      if (html.includes(pdfProbe)) {
        ok("…and is handed the file when there is one", "invariant 7's allowed half");
      } else {
        bad("…and is handed the file when there is one", "the link is not on the page");
      }
      await prisma.certificate.update({
        where: { certificateId: target.certificateId },
        data: { pdfUrl: target.pdfUrl },
      });
    }
  }

  // The batch and course to hang the two probe certificates off.
  const probeBatch = await prisma.studentBatchMapping.findFirst({
    where: { studentId: student.studentId, deletedAt: null },
    select: { batchId: true, batch: { select: { courseId: true } } },
  });

  if (probeBatch === null) {
    console.log("  \x1b[90m· no batch to issue a probe certificate against\x1b[0m");
  } else {
    const stamp = Date.now().toString().slice(-9);

    /*
     * A DRAFT certificate is an admin's work in progress. Showing one promises
     * something nobody has granted — and its code must not verify either, which
     * is the part a screen check alone would miss.
     */
    const draft = await prisma.certificate.create({
      data: {
        certificateNumber: `GK-CERT-PROBE-D${stamp}`,
        verificationCode: `probe-draft-${stamp}`,
        studentId: student.studentId,
        courseId: probeBatch.batch.courseId,
        batchId: probeBatch.batchId,
        status: "DRAFT",
      },
      select: { certificateId: true, certificateNumber: true, verificationCode: true },
    });

    await page.goto(`${BASE}/portal/certificates`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    const withDraft = await page.locator("body").innerText();
    if (
      !withDraft.includes(draft.certificateNumber) &&
      !withDraft.includes(draft.verificationCode)
    ) {
      ok("a draft certificate is withheld", "neither its number nor its code");
    } else {
      bad("a draft certificate is withheld", "a certificate nobody issued is on the student's page");
    }

    const draftCheck = await publicVerify(browser, draft.verificationCode);
    if (/do not recognise/i.test(draftCheck) && !draftCheck.includes(draft.certificateNumber)) {
      ok("…and its code does not verify", "an unissued code names nobody");
    } else {
      bad("…and its code does not verify", draftCheck.slice(0, 160));
    }

    await prisma.certificate.delete({ where: { certificateId: draft.certificateId } });

    /*
     * A withdrawn certificate stays on the screen, because it will fail
     * verification and the student is the one who will be standing there when it
     * does. What must NOT be there: the sentence telling them to hand the code
     * out, the code itself, or the reason an admin typed into the register.
     */
    const reason = `probe-internal-note-${stamp} — not for the student`;
    const revoked = await prisma.certificate.create({
      data: {
        certificateNumber: `GK-CERT-PROBE-R${stamp}`,
        verificationCode: `probe-revoked-${stamp}`,
        studentId: student.studentId,
        courseId: probeBatch.batch.courseId,
        batchId: probeBatch.batchId,
        status: "REVOKED",
        issuedDate: new Date(),
        revokedAt: new Date(),
        revokedReason: reason,
      },
      select: { certificateId: true, certificateNumber: true, verificationCode: true },
    });

    await page.goto(`${BASE}/portal/certificates`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    const withRevoked = await page.locator("body").innerText();
    const shown = withRevoked.includes(revoked.certificateNumber);
    const saysWithdrawn = /withdrawn/i.test(withRevoked);
    const leaksReason = withRevoked.includes(reason) || withRevoked.includes(`probe-internal-note-${stamp}`);
    const offersCode = withRevoked.includes(revoked.verificationCode);
    if (shown && saysWithdrawn && !leaksReason && !offersCode) {
      ok("a withdrawn certificate is shown without its code or its reason", revoked.certificateNumber);
    } else {
      bad(
        "a withdrawn certificate is shown without its code or its reason",
        `shown=${shown} saysWithdrawn=${saysWithdrawn} leaksReason=${leaksReason} offersCode=${offersCode}`,
      );
    }

    const revokedCheck = await publicVerify(browser, revoked.verificationCode);
    if (
      /has been withdrawn/i.test(revokedCheck) &&
      revokedCheck.includes(revoked.certificateNumber) &&
      !revokedCheck.includes(reason)
    ) {
      ok("and the public verifier says withdrawn, not unknown", "the reader is holding a paper copy");
    } else {
      bad("and the public verifier says withdrawn, not unknown", revokedCheck.slice(0, 160));
    }

    await prisma.certificate.delete({ where: { certificateId: revoked.certificateId } });
  }

  // ── 9d. The verifier answers a stranger, with no session at all ─────────
  if (issued[0] !== undefined) {
    const genuine = await publicVerify(browser, issued[0].verificationCode);
    if (/is genuine/i.test(genuine) && genuine.includes(issued[0].certificateNumber)) {
      ok("the public verifier confirms a live certificate", "no sign-in, no cookies");
    } else {
      bad("the public verifier confirms a live certificate", genuine.slice(0, 160));
    }
  }

  const nonsense = await publicVerify(browser, `not-a-code-${Date.now()}`);
  if (/do not recognise/i.test(nonsense)) {
    ok("…and refuses a code it does not hold");
  } else {
    bad("…and refuses a code it does not hold", nonsense.slice(0, 160));
  }

  // ── 9e. Jobs: the audience predicate, checked in both directions ────────
  /*
   * The one thing this feature rests on.
   *
   * `hiring.service.ts` asks "given a posting's rules, which students does it
   * reach". `/me/jobs` asks the inverse: "given a student, which postings reach
   * them". Both read the same rows at read time — nothing is materialised —
   * but the inverse is the rule semantics written backwards, and backwards is
   * where two implementations drift apart without anything failing.
   *
   * So this checks three links, not one:
   *
   *   A. the reference below agrees with the SERVICE's own forward predicate,
   *      measured through the reach the admin API publishes per posting;
   *   B. the inverse agrees with the reference, per student;
   *   C. what the feed withholds — draft, closed, and past its closing date.
   *
   * Without A, the reference here would be a second copy free to drift with the
   * inverse and agree with it while both were wrong.
   */
  // ── The axis probes, built BEFORE anything is measured ────────────────
  /*
   * Why this exists, and what it replaces.
   *
   * A and B compare the two directions over whatever postings the data
   * happens to hold — and the data holds almost nothing but course-only
   * rules. Breaking the inverse's `completedOnly` branch on purpose left both
   * checks green, because no posting targeted an UNFINISHED student's course
   * with it. A check that cannot fail is not a check, so the suite stops
   * relying on the seed and builds its own truth table: one posting per axis,
   * aimed squarely at the student under test, with the answer known in
   * advance from that student's own record.
   *
   * Every probe is also swept up by A and B, so each one is cross-examined by
   * the service's reach and by the reference predicate as well as by the
   * expectation written beside it here.
   */
  const axisStamp = Date.now().toString().slice(-9);
  const axisProbes: { jobPostingId: string; label: string; expect: boolean; who: string }[] = [];

  for (const email of [STUDENT, COLLEGE_STUDENT]) {
    const who = await prisma.student.findFirst({
      where: { loginEmail: email, deletedAt: null },
      select: {
        studentId: true,
        passoutYear: true,
        cityId: true,
        collegeId: true,
        enrolmentChannel: true,
        batchMappings: {
          where: { deletedAt: null },
          select: { batchId: true, completedAt: true, batch: { select: { courseId: true } } },
        },
      },
    });
    const mapping = who?.batchMappings[0];
    if (who === null || mapping === undefined) continue;

    // Something of each kind that is NOT theirs, so "must not match" probes
    // are aimed at a real row rather than at a fiction the database rejects.
    const [otherCourse, otherBatch, otherCity] = await Promise.all([
      prisma.course.findFirst({
        where: { deletedAt: null, courseId: { not: mapping.batch.courseId } },
        select: { courseId: true },
      }),
      prisma.batch.findFirst({
        where: { deletedAt: null, batchId: { not: mapping.batchId } },
        select: { batchId: true },
      }),
      prisma.city.findFirst({
        where: { deletedAt: null, ...(who.cityId === null ? {} : { cityId: { not: who.cityId } }) },
        select: { cityId: true },
      }),
    ]);

    const finished = mapping.completedAt !== null;
    const course = mapping.batch.courseId;

    const axes: [string, Prisma.JobAudienceRuleUncheckedCreateWithoutJobPostingInput, boolean][] = [
      ["course", { courseId: course, completedOnly: false }, true],
      // The one the broken build got wrong: a rule wanting finishers must
      // reach a student who finished and no one else.
      ["completedOnly", { courseId: course, completedOnly: true }, finished],
      ["theirBatch", { courseId: course, batchId: mapping.batchId, completedOnly: false }, true],
      ["theirPassout", { courseId: course, passoutYear: who.passoutYear, completedOnly: false }, who.passoutYear !== null],
      ["wrongPassout", { courseId: course, passoutYear: 1899, completedOnly: false }, false],
      ["theirSegment", { courseId: course, segment: who.enrolmentChannel, completedOnly: false }, true],
      [
        "wrongSegment",
        { courseId: course, segment: who.enrolmentChannel === "RETAIL" ? "COLLEGE" : "RETAIL", completedOnly: false },
        false,
      ],
      ...(who.cityId === null
        ? []
        : ([["theirCity", { courseId: course, cityId: who.cityId, completedOnly: false }, true]] as [
            string,
            Prisma.JobAudienceRuleUncheckedCreateWithoutJobPostingInput,
            boolean,
          ][])),
      ...(otherCity === null
        ? []
        : ([["wrongCity", { courseId: course, cityId: otherCity.cityId, completedOnly: false }, false]] as [
            string,
            Prisma.JobAudienceRuleUncheckedCreateWithoutJobPostingInput,
            boolean,
          ][])),
      ...(otherBatch === null
        ? []
        : ([["wrongBatch", { courseId: course, batchId: otherBatch.batchId, completedOnly: false }, false]] as [
            string,
            Prisma.JobAudienceRuleUncheckedCreateWithoutJobPostingInput,
            boolean,
          ][])),
      ...(otherCourse === null
        ? []
        : ([["wrongCourse", { courseId: otherCourse.courseId, completedOnly: false }, false]] as [
            string,
            Prisma.JobAudienceRuleUncheckedCreateWithoutJobPostingInput,
            boolean,
          ][])),
    ];

    for (const [label, rule, expect] of axes) {
      const posting = await prisma.jobPosting.create({
        data: {
          jobCode: `JOB-AXIS-${axisStamp}-${axisProbes.length}`,
          roleTitle: `axis-${label}-${axisStamp}`,
          companyName: "Axis Probe Ltd",
          status: "PUBLISHED",
          publishedAt: new Date(),
          audienceRules: { create: rule },
        },
        select: { jobPostingId: true },
      });
      axisProbes.push({ jobPostingId: posting.jobPostingId, label, expect, who: email });
    }
  }


  const inDate: Prisma.JobPostingWhereInput = {
    deletedAt: null,
    status: "PUBLISHED",
    OR: [{ closingDate: null }, { closingDate: { gte: startOfToday() } }],
  };

  const postings = await prisma.jobPosting.findMany({
    where: inDate,
    select: {
      jobPostingId: true,
      jobCode: true,
      roleTitle: true,
      audienceRules: { where: { deletedAt: null } },
    },
  });
  const targeted = postings.filter((p) => p.audienceRules.length > 0);

  const adminToken = await signInAtApi("priya@gurukulam.test", "ADMIN_USER");

  if (targeted.length === 0 || adminToken === undefined) {
    console.log("  \x1b[90m· no targeted posting, or no admin token — the audience checks are skipped\x1b[0m");
  } else {
    // ── A. the reference matches the service's own reach ──────────────────
    const drifted: string[] = [];
    for (const posting of targeted) {
      const response = await fetch(`${API}/hiring/${posting.jobPostingId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const { reach } = (await response.json()) as { reach?: number };
      const mine = await prisma.student.count({ where: audienceOf(posting.audienceRules) });
      if (reach !== mine) drifted.push(`${posting.jobCode}: service ${String(reach)} ≠ reference ${mine}`);
    }
    if (drifted.length === 0) {
      ok("the reference audience matches the service's own", `${targeted.length} postings, by reach`);
    } else {
      bad("the reference audience matches the service's own", drifted.slice(0, 3).join(" · "));
    }

    // ── B. the inverse agrees with the reference, per student ─────────────
    for (const [label, email] of [
      ["retail", STUDENT],
      ["college", COLLEGE_STUDENT],
    ] as const) {
      const who = await prisma.student.findFirstOrThrow({
        where: { loginEmail: email },
        select: { studentId: true },
      });

      const forward: string[] = [];
      for (const posting of targeted) {
        const hit = await prisma.student.count({
          where: { AND: [audienceOf(posting.audienceRules), { studentId: who.studentId }] },
        });
        if (hit > 0) forward.push(posting.jobPostingId);
      }

      const token = await signInAtApi(email, "STUDENT");
      const feed =
        token === undefined
          ? []
          : ((await (
              await fetch(`${API}/me/jobs`, { headers: { Authorization: `Bearer ${token}` } })
            ).json()) as { jobPostingId: string }[]);
      const inverse = feed.map((job) => job.jobPostingId);

      const onlyForward = forward.filter((id) => !inverse.includes(id));
      const onlyInverse = inverse.filter((id) => !forward.includes(id));

      if (token === undefined) {
        bad(`the feed matches the audience (${label})`, "could not sign the student in at the API");
      } else if (onlyForward.length === 0 && onlyInverse.length === 0) {
        ok(
          `the feed matches the audience (${label})`,
          `${inverse.length} of ${targeted.length} postings, both directions`,
        );
      } else {
        bad(
          `the feed matches the audience (${label})`,
          `reached but not fed: ${onlyForward.length}; fed but not reached: ${onlyInverse.length}`,
        );
      }
    }

    // ── C. every axis decides the way the student's record says ──────────
    if (axisProbes.length === 0) {
      console.log("  \x1b[90m· neither student is on a batch — the axis table is skipped\x1b[0m");
    } else {
      for (const email of [STUDENT, COLLEGE_STUDENT]) {
        const mine = axisProbes.filter((probe) => probe.who === email);
        if (mine.length === 0) continue;

        const token = await signInAtApi(email, "STUDENT");
        const fed =
          token === undefined
            ? []
            : ((await (
                await fetch(`${API}/me/jobs`, { headers: { Authorization: `Bearer ${token}` } })
              ).json()) as { jobPostingId: string }[]).map((job) => job.jobPostingId);

        const wrong = mine.filter((probe) => fed.includes(probe.jobPostingId) !== probe.expect);
        const label = email === STUDENT ? "retail" : "college";
        if (token === undefined) {
          bad(`every audience axis decides correctly (${label})`, "could not sign in at the API");
        } else if (wrong.length === 0) {
          ok(
            `every audience axis decides correctly (${label})`,
            `${mine.length} axes: ${mine.filter((p) => p.expect).length} reach, ${mine.filter((p) => !p.expect).length} do not`,
          );
        } else {
          bad(
            `every audience axis decides correctly (${label})`,
            wrong.map((p) => `${p.label} should ${p.expect ? "match" : "not match"}`).join(" · "),
          );
        }
      }
    }

    // ── D. what the feed withholds ────────────────────────────────────────
    const onTheirCourse = await prisma.studentBatchMapping.findFirst({
      where: { student: { loginEmail: STUDENT }, deletedAt: null },
      select: { batch: { select: { courseId: true } } },
    });

    if (onTheirCourse === null) {
      console.log("  \x1b[90m· the student is on no batch — the withholding checks are skipped\x1b[0m");
    } else {
      const stamp = Date.now().toString().slice(-9);
      /*
       * Three postings a student must never be fed, each for a different
       * reason, all targeted squarely at them so only the rule under test can
       * keep them out:
       *
       *   DRAFT       — nobody has decided it exists.
       *   CLOSED      — the link leads to a form that is shut.
       *   past its date — closed whether or not anyone moved the status.
       */
      const probes = await Promise.all(
        (
          [
            ["DRAFT", "DRAFT", null],
            ["CLOSED", "CLOSED", null],
            ["EXPIRED", "PUBLISHED", new Date(Date.now() - 2 * 86_400_000)],
          ] as const
        ).map(([label, status, closingDate], i) =>
          prisma.jobPosting.create({
            data: {
              jobCode: `JOB-PROBE-${label}-${stamp}`,
              roleTitle: `probe-${label.toLowerCase()}-${stamp}`,
              companyName: "Probe Industries",
              status,
              publishedAt: new Date(),
              ...(closingDate === null ? {} : { closingDate }),
              audienceRules: {
                create: { courseId: onTheirCourse.batch.courseId, completedOnly: false },
              },
            },
            select: { jobPostingId: true, roleTitle: true },
          }).then((row) => ({ label, index: i, ...row })),
        ),
      );

      const token = await signInAtApi(STUDENT, "STUDENT");
      const fed =
        token === undefined
          ? []
          : ((await (
              await fetch(`${API}/me/jobs`, { headers: { Authorization: `Bearer ${token}` } })
            ).json()) as { jobPostingId: string }[]).map((job) => job.jobPostingId);

      const leaked = probes.filter((probe) => fed.includes(probe.jobPostingId));
      if (token !== undefined && leaked.length === 0) {
        ok("draft, closed and expired postings are withheld", "all three targeted at this student");
      } else {
        bad(
          "draft, closed and expired postings are withheld",
          leaked.length === 0 ? "no student token" : `fed: ${leaked.map((p) => p.label).join(", ")}`,
        );
      }

      await prisma.jobAudienceRule.deleteMany({
        where: { jobPostingId: { in: probes.map((p) => p.jobPostingId) } },
      });
      await prisma.jobPosting.deleteMany({
        where: { jobPostingId: { in: probes.map((p) => p.jobPostingId) } },
      });
    }

    // ── E. and the screen says why, not just what ─────────────────────────
    await page.goto(`${BASE}/portal/jobs`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    const board = await page.locator("body").innerText();
    const token = await signInAtApi(STUDENT, "STUDENT");
    const feed =
      token === undefined
        ? []
        : ((await (
            await fetch(`${API}/me/jobs`, { headers: { Authorization: `Bearer ${token}` } })
          ).json()) as { roleTitle: string; matchedOn: string[] }[]);

    if (feed.length === 0) {
      console.log("  \x1b[90m· this student matches no posting — the screen is not exercised\x1b[0m");
    } else {
      const first = feed[0]!;
      const named = board.includes(first.roleTitle);
      const explained = first.matchedOn.every((reason) => board.includes(reason));
      const saysMatched = /Matched on/i.test(board);
      if (named && explained && saysMatched) {
        ok("the board says why each posting is there", first.matchedOn.join("; "));
      } else {
        bad(
          "the board says why each posting is there",
          `named=${named} explained=${explained} saysMatched=${saysMatched}`,
        );
      }
    }
  }

  // Swept up whether or not the block above ran, so a skipped suite does not
  // leave probe postings behind for the next one to measure as real data.
  await prisma.jobAudienceRule.deleteMany({
    where: { jobPostingId: { in: axisProbes.map((p) => p.jobPostingId) } },
  });
  await prisma.jobPosting.deleteMany({
    where: { jobPostingId: { in: axisProbes.map((p) => p.jobPostingId) } },
  });

  // ── 9f. Notifications: emitted, swept, and never the operator's ─────────
  const collegeStudent = await prisma.student.findFirst({
    where: { loginEmail: COLLEGE_STUDENT, deletedAt: null },
    select: { studentId: true },
  });
  const theirBatch = await prisma.studentBatchMapping.findFirst({
    where: { studentId: student.studentId, deletedAt: null, isActive: true },
    select: { batchId: true },
  });

  if (adminToken === undefined || theirBatch === null) {
    console.log("  \x1b[90m· no admin token or no batch — the notification checks are skipped\x1b[0m");
  } else {
    const noticeStamp = Date.now().toString().slice(-9);
    const before = await prisma.notification.count({
      where: { recipientType: "STUDENT", recipientId: student.studentId },
    });

    /*
     * A cancelled session, driven through the admin API exactly as an operator
     * would. Created future-dated so the "do not notify about the past" rule
     * is not what is being measured here.
     */
    const probeSession = await prisma.batchSession.create({
      data: {
        sessionCode: `SES-NOTE-${noticeStamp}`,
        batchId: theirBatch.batchId,
        title: `notice-probe-${noticeStamp}`,
        sequence: 900,
        scheduledDate: new Date(Date.now() + 30 * 86_400_000),
        startTime: new Date("1970-01-01T09:00:00Z"),
        endTime: new Date("1970-01-01T11:00:00Z"),
        mode: "ONLINE",
      },
      select: { sessionId: true, title: true },
    });

    await fetch(`${API}/batches/sessions/${probeSession.sessionId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ reason: `probe cancellation ${noticeStamp}` }),
    });

    const cancelled = await prisma.notification.findFirst({
      where: {
        recipientType: "STUDENT",
        recipientId: student.studentId,
        type: "session.cancelled",
        subjectId: probeSession.sessionId,
      },
      select: { class: true, groupKey: true, body: true },
    });

    if (cancelled?.class === "ALERT" && cancelled.groupKey === null) {
      ok("a cancelled session reaches the roster", "ALERT, and carrying no group key");
    } else {
      bad(
        "a cancelled session reaches the roster",
        cancelled === null ? "no notice was emitted" : `class=${cancelled.class} groupKey=${String(cancelled.groupKey)}`,
      );
    }

    /*
     * The group key is the whole reason emit() and sweep() can coexist. An
     * emitted row that borrowed one would be RESOLVED by the next nightly run
     * — the cancellation notice would disappear and nobody would know it had.
     * Checked across every emitted row this student holds, not just the probe.
     */
    const EMITTED = [
      "session.added", "session.rescheduled", "session.updated", "session.cancelled",
      "session.recording_published", "assignment.published",
      "installment.due", "installment.overdue",
    ];
    const keyed = await prisma.notification.count({
      where: {
        recipientType: "STUDENT",
        recipientId: student.studentId,
        type: { in: EMITTED },
        groupKey: { not: null },
      },
    });
    const emittedTotal = await prisma.notification.count({
      where: { recipientType: "STUDENT", recipientId: student.studentId, type: { in: EMITTED } },
    });
    if (keyed === 0) {
      ok("no emitted notice carries a group key", `${emittedTotal} checked — the sweep cannot resolve one`);
    } else {
      bad("no emitted notice carries a group key", `${keyed} of ${emittedTotal} would be swept away`);
    }

    // A backdated session is a BACKFILL. Twenty of them must not be twenty
    // notices about classes the roster already sat through.
    const countNow = async (): Promise<number> =>
      prisma.notification.count({
        where: { recipientType: "STUDENT", recipientId: student.studentId },
      });
    const afterCancel = await countNow();

    const backdated = await fetch(`${API}/batches/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        batchId: theirBatch.batchId,
        title: `backfill-probe-${noticeStamp}`,
        scheduledDate: "2026-01-06",
        startTime: "10:00",
        endTime: "12:00",
      }),
    });
    const backdatedRow = (await backdated.json()) as { sessionId?: string };

    if (backdatedRow.sessionId === undefined) {
      bad("a backdated session notifies nobody", "the session could not be created");
    } else if ((await countNow()) === afterCancel) {
      ok("a backdated session notifies nobody", "a backfill is history, not news");
    } else {
      bad("a backdated session notifies nobody", "the roster was told about a class already sat");
    }

    /*
     * An edit is also how a venue typo is corrected, and "your session was
     * updated" is the kind of noise that teaches people to stop reading the
     * bell. A title change must be silent; a venue change must not be.
     */
    const afterBackfill = await countNow();
    await fetch(`${API}/batches/sessions/${probeSession.sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ title: `notice-probe-renamed-${noticeStamp}` }),
    });
    const afterRename = await countNow();

    await fetch(`${API}/batches/sessions/${probeSession.sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ venue: `Room ${noticeStamp}` }),
    });
    const afterVenue = await countNow();

    if (afterRename === afterBackfill && afterVenue > afterRename) {
      ok("an edit notifies only when something a student plans around moved", "title silent, venue not");
    } else {
      bad(
        "an edit notifies only when something a student plans around moved",
        `rename raised ${afterRename - afterBackfill} (want 0), venue raised ${afterVenue - afterRename} (want 1)`,
      );
    }

    // ── The student surface is not the operator queue ─────────────────────
    const studentToken = await signInAtApi(STUDENT, "STUDENT");
    const feed =
      studentToken === undefined
        ? null
        : ((await (
            await fetch(`${API}/me/notifications`, {
              headers: { Authorization: `Bearer ${studentToken}` },
            })
          ).json()) as { items: { notificationId: string; class: string; read: boolean }[]; badge: number });

    const operatorRows = await prisma.notification.count({
      where: { recipientId: null, recipientType: null, status: { not: "RESOLVED" } },
    });

    if (feed === null) {
      bad("a student never sees an operator's queue", "could not sign in at the API");
    } else {
      /*
       * Compared in TypeScript, not in SQL.
       *
       * An earlier version asked Prisma for `NOT: { recipientType: "STUDENT",
       * recipientId: <them> }` — and an operator row has NULL in both columns,
       * so `NOT (NULL = 'STUDENT' AND NULL = '…')` is NULL rather than true and
       * the row was excluded from the count. The check passed against a build
       * that was handing the student "140 issued credentials have never been
       * used". Three-valued logic is not the place to ask "is this row not
       * theirs".
       */
      const ids = feed.items.map((i) => i.notificationId);
      const fetched =
        ids.length === 0
          ? []
          : await prisma.notification.findMany({
              where: { notificationId: { in: ids } },
              select: { recipientType: true, recipientId: true },
            });
      const notTheirs = fetched.filter(
        (row) => row.recipientType !== "STUDENT" || row.recipientId !== student.studentId,
      ).length;
      if (notTheirs === 0) {
        ok(
          "a student never sees an operator's queue",
          `${operatorRows} unaddressed operator row(s) exist; none reached them`,
        );
      } else {
        bad("a student never sees an operator's queue", `${notTheirs} row(s) belong to somebody else`);
      }

      // FYI never badges. Most of what a student is told is FYI, and a badge
      // that is permanently lit is one nobody reads.
      const expected = feed.items.filter((i) => !i.read && i.class !== "FYI").length;
      if (feed.badge === expected) {
        ok("the badge counts only what needs attention", `${feed.badge} of ${feed.items.length}`);
      } else {
        bad("the badge counts only what needs attention", `badge=${feed.badge}, expected ${expected}`);
      }

      /*
       * Mark-all-read must not touch ACTION_REQUIRED. Those clear when their
       * condition does — the work is handed in, the instalment is paid — and a
       * student who could dismiss "work due tomorrow" would have dismissed the
       * one thing asking them to act.
       */
      const actionBefore = await prisma.notification.count({
        where: {
          recipientType: "STUDENT", recipientId: student.studentId,
          class: "ACTION_REQUIRED", status: "OPEN",
        },
      });
      await fetch(`${API}/me/notifications/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${studentToken}` },
        body: JSON.stringify({ all: true }),
      });
      const [actionAfter, fyiOpen] = await Promise.all([
        prisma.notification.count({
          where: {
            recipientType: "STUDENT", recipientId: student.studentId,
            class: "ACTION_REQUIRED", status: "OPEN",
          },
        }),
        prisma.notification.count({
          where: {
            recipientType: "STUDENT", recipientId: student.studentId,
            class: { in: ["FYI", "ALERT"] }, status: "OPEN",
          },
        }),
      ]);
      if (actionAfter === actionBefore && fyiOpen === 0) {
        ok("marking read leaves what needs doing alone", `${actionBefore} action row(s) untouched`);
      } else {
        bad(
          "marking read leaves what needs doing alone",
          `action ${actionBefore} → ${actionAfter}, ${fyiOpen} FYI/ALERT still open`,
        );
      }
    }

    // ── Invariant 6: a college student is told nothing about money ────────
    if (collegeStudent === null) {
      console.log("  \x1b[90m· no college student — the reminder invariant is not exercised\x1b[0m");
    } else {
      const theirFeeNotices = await prisma.notification.count({
        where: {
          recipientType: "STUDENT",
          recipientId: collegeStudent.studentId,
          type: { in: ["installment.due", "installment.overdue"] },
        },
      });
      const ladderRungs = await prisma.feeInstallmentReminder.count();
      if (theirFeeNotices === 0) {
        ok(
          "invariant 6 — a college student gets no money reminder",
          `${ladderRungs} rung(s) sent, none to them`,
        );
      } else {
        bad(
          "invariant 6 — a college student gets no money reminder",
          `${theirFeeNotices} reminder(s) about somebody else's invoice`,
        );
      }
    }

    // Sweep the probes up, and the notices they raised with them.
    const probeIds = [probeSession.sessionId, backdatedRow.sessionId].filter(
      (id): id is string => id !== undefined,
    );
    await prisma.notification.deleteMany({ where: { subjectId: { in: probeIds } } });
    await prisma.batchSession.deleteMany({ where: { sessionId: { in: probeIds } } });
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
  /*
   * Invariant 7, from the other side of the asymmetry.
   *
   * A college student earned an identical certificate and cannot fetch it. The
   * record, the number and the code are still theirs — hiding the certificate
   * would read as a bug to somebody who knows they passed — so this checks that
   * the page EXPLAINS rather than refuses, and that no download is offered.
   */
  const collegeCerts = await prisma.certificate.findMany({
    where: { student: { loginEmail: COLLEGE_STUDENT }, deletedAt: null, status: "ISSUED" },
    select: { certificateNumber: true, verificationCode: true },
  });

  if (collegeCerts.length === 0) {
    console.log("  \x1b[90m· the college student holds no certificate — invariant 7 not exercised\x1b[0m");
  } else {
    /*
     * A file is put behind their certificate for the length of this check, for
     * the reason recorded on the retail half: with every `pdf_url` null, "no
     * download offered" is true whatever the access rule says, and the check
     * could not fail if invariant 7 were removed tomorrow.
     */
    const collegePdf = `https://example.test/college-pdf/${Date.now()}`;
    const theirCert = await prisma.certificate.findFirst({
      where: { student: { loginEmail: COLLEGE_STUDENT }, deletedAt: null, status: "ISSUED" },
      select: { certificateId: true, pdfUrl: true },
    });
    if (theirCert !== null) {
      await prisma.certificate.update({
        where: { certificateId: theirCert.certificateId },
        data: { pdfUrl: collegePdf },
      });
    }

    await college.goto(`${BASE}/portal/certificates`, { waitUntil: "domcontentloaded" });
    await college.waitForLoadState("load");
    const theirs = await college.locator("body").innerText();
    const theirsHtml = await college.content();
    const record = collegeCerts.every(
      (c) => theirs.includes(c.certificateNumber) && theirs.includes(c.verificationCode),
    );
    /*
     * Two sentences, and the check wants both.
     *
     * The page names the arrangement once — which institution collects the
     * certificates — and each card says where THIS copy comes from. An earlier
     * version matched only a phrase that happened to appear in both, and when
     * the duplicate was removed from the card it went on passing against the
     * banner while saying it had checked the card. Naming each one separately is
     * what stops that.
     */
    const namesArrangement = /collects and issues/i.test(theirs);
    const perCertificate = /the copy comes from your placement office/i.test(theirs);
    const explains = namesArrangement && perCertificate;
    const offersFile = /Download the certificate/i.test(theirs);
    // The URL itself, not just the link's words: a href the markup carries but
    // the label hides is still a file handed over.
    const leaksUrl = theirCert !== null && theirsHtml.includes(collegePdf);

    if (record && explains && !offersFile && !leaksUrl) {
      ok(
        "invariant 7 — the record is theirs, the download is the college's",
        theirCert === null ? "explained, not refused" : "explained, and the file withheld with one there",
      );
    } else {
      bad(
        "invariant 7 — the record is theirs, the download is the college's",
        `record=${record} namesArrangement=${namesArrangement} perCertificate=${perCertificate} offersDownload=${offersFile} leaksUrl=${leaksUrl}`,
      );
    }

    if (theirCert !== null) {
      await prisma.certificate.update({
        where: { certificateId: theirCert.certificateId },
        data: { pdfUrl: theirCert.pdfUrl },
      });
    }
  }

  await college.close();

  await attendanceChecks(page, student.studentId);

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
 * Attendance: the figure a certificate turns on, from the student's side.
 *
 * ── Why every case here is MANUFACTURED ─────────────────────────────────
 *
 * The seed gives this student one completed session and one PRESENT row, which
 * exercises exactly one of five behaviours. Everything that matters — LATE
 * counting as attendance, an untaken register reading as NOT_EVALUATED rather
 * than 0%, a student who is simply not on a register that was taken, and the
 * BELOW_FLOOR verdict that refuses a certificate — does not exist in the data
 * and would silently never be tested. So the register is built to a known shape,
 * asserted, and put back exactly as it was found.
 *
 * The same shape as the trainer suite's borrowed second student and the
 * certificate suite's temporary `pdf_url`: a check whose condition is absent is
 * a check that passes for the wrong reason.
 */
async function attendanceChecks(page: Page, studentId: string): Promise<void> {
  const mapping = await prisma.studentBatchMapping.findFirst({
    where: { studentId, deletedAt: null, isActive: true },
    select: { batchId: true },
  });
  if (mapping === null) {
    bad("attendance is measured against the certificate rule", "the student is on no live batch");
    return;
  }

  const batch = await prisma.batch.findUniqueOrThrow({
    where: { batchId: mapping.batchId },
    select: { batchId: true, batchCode: true, courseId: true },
  });

  /* Everything this function touches, read BEFORE it touches any of it. The
     restore at the end writes these values back rather than assuming what they
     were — a suite that guesses the previous state is a suite that corrupts it
     on the first surprise. */
  const sessionsBefore = await prisma.batchSession.findMany({
    where: { batchId: batch.batchId, deletedAt: null },
    select: { sessionId: true, sessionCode: true, status: true, completedAt: true, scheduledDate: true },
    orderBy: { scheduledDate: "asc" },
  });
  const attendanceBefore = await prisma.studentAttendance.findMany({
    where: { session: { batchId: batch.batchId } },
    select: { attendanceId: true, sessionId: true, studentId: true, status: true },
  });
  const courseBefore = await prisma.course.findUniqueOrThrow({
    where: { courseId: batch.courseId },
    select: { attendanceFloorPct: true },
  });

  /*
   * Four days that have already happened, so the register applies to them.
   * `hasHappened` on the API is a calendar test, and a session in the future
   * would be excluded from the screen for a reason that has nothing to do with
   * what is being measured here.
   */
  const past = sessionsBefore.filter((session) => session.scheduledDate <= startOfToday());
  if (past.length < 4) {
    bad(
      "attendance is measured against the certificate rule",
      `only ${past.length} of this batch's sessions have happened; four are needed`,
    );
    return;
  }
  const [present, late, absent, unmarked] = past.slice(0, 4);
  /*
   * A SECOND student on this roster, for the length of the check.
   *
   * "The register was taken and you are not on it" cannot happen on a roster of
   * one — there would be no register without them — so on the seeded batch that
   * case reported itself vacuous and passed. Borrowed, used, and handed back,
   * exactly as `verify:teach` does for the whole-register property. Retail only:
   * invariant 2 forbids mixing rosters, and this batch has no college.
   */
  const batchRow = await prisma.batch.findUniqueOrThrow({
    where: { batchId: batch.batchId },
    select: { collegeId: true },
  });
  const roster = await prisma.studentBatchMapping.findMany({
    where: { batchId: batch.batchId, deletedAt: null },
    select: { studentId: true },
  });
  let borrowed: string | null = null;
  if (roster.every((row) => row.studentId === studentId)) {
    const spare = await prisma.student.findFirst({
      where: {
        deletedAt: null,
        accountStatus: "ACTIVE",
        collegeId: batchRow.collegeId,
        studentId: { not: studentId },
        batchMappings: { none: { batchId: batch.batchId, deletedAt: null } },
      },
      select: { studentId: true },
    });
    if (spare !== null) {
      await prisma.studentBatchMapping.create({
        data: { studentId: spare.studentId, batchId: batch.batchId, isActive: true },
      });
      borrowed = spare.studentId;
    }
  }
  const somebodyElse = borrowed ?? roster.find((row) => row.studentId !== studentId)?.studentId ?? null;

  try {
    // Four delivered sessions: the denominator the floor is measured against.
    await prisma.batchSession.updateMany({
      where: { sessionId: { in: [present!.sessionId, late!.sessionId, absent!.sessionId, unmarked!.sessionId] } },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    await prisma.studentAttendance.deleteMany({ where: { session: { batchId: batch.batchId } } });

    const mark = async (sessionId: string, who: string, status: "PRESENT" | "LATE" | "ABSENT") => {
      await prisma.studentAttendance.create({
        data: { sessionId, studentId: who, status, markedAt: new Date() },
      });
    };
    await mark(present!.sessionId, studentId, "PRESENT");
    await mark(late!.sessionId, studentId, "LATE");
    await mark(absent!.sessionId, studentId, "ABSENT");
    /* The fourth day: a register WAS taken and this student is not on it. Needs
       somebody else's row to exist, which is the difference between "you were
       not marked" and "nobody was marked" — the two the screen must not blur. */
    if (somebodyElse !== null) await mark(unmarked!.sessionId, somebodyElse, "PRESENT");

    // A floor this register is below: 2 of 4 is 50%.
    await prisma.course.update({
      where: { courseId: batch.courseId },
      data: { attendanceFloorPct: 75 },
    });

    const token = await signInAtApi(STUDENT, "STUDENT");
    const read = async () => {
      const response = await fetch(`${API}/me/attendance`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await response.json()) as {
        batches?: {
          batchId: string;
          deliveredCount: number;
          attendedCount: number;
          attendancePct: number | null;
          attendanceFloorPct: number | null;
          attendanceCheck: string;
          sessions: { sessionId: string; status: string | null; counted: boolean; registerTaken: boolean }[];
        }[];
      };
      return (body.batches ?? []).find((row) => row.batchId === batch.batchId);
    };

    const mine = await read();
    /*
     * LATE counts, ABSENT does not, and an unmarked row does not either: 2 of 4.
     * Asserted as one figure rather than four, because the percentage is the
     * thing a certificate is refused on and each of those three rules moves it.
     */
    if (
      mine?.deliveredCount === 4 &&
      mine.attendedCount === 2 &&
      mine.attendancePct === 50 &&
      mine.attendanceFloorPct === 75 &&
      mine.attendanceCheck === "BELOW_FLOOR"
    ) {
      ok(
        "LATE counts as attendance, ABSENT and unmarked do not",
        `2 of 4 delivered = 50%, below the 75% floor`,
      );
    } else {
      bad(
        "LATE counts as attendance, ABSENT and unmarked do not",
        `attended ${mine?.attendedCount} of ${mine?.deliveredCount} = ${mine?.attendancePct}%, floor ${mine?.attendanceFloorPct}, ${mine?.attendanceCheck}`,
      );
    }

    /*
     * The same figure, from the service the CERTIFICATE is judged on.
     *
     * This is the check the screen exists to earn: a portal that told a student
     * 50% while `eligibility.service.ts` read something else would explain a
     * refusal with a number nobody used. Asked as an admin, because that is the
     * endpoint the console issues from.
     */
    const adminToken = await signInAtApi("priya@gurukulam.test", "ADMIN_USER");
    const verdict = await fetch(
      `${API}/certificates/eligibility?studentId=${studentId}&batchId=${batch.batchId}`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    const eligibility = (await verdict.json()) as {
      attendancePct?: number | null;
      sessionsAttended?: number;
      sessionsCompleted?: number;
      attendanceCheck?: string;
    };
    if (
      eligibility.attendancePct === mine?.attendancePct &&
      eligibility.sessionsAttended === mine?.attendedCount &&
      eligibility.sessionsCompleted === mine?.deliveredCount &&
      eligibility.attendanceCheck === mine?.attendanceCheck
    ) {
      ok(
        "the portal's figure IS the certificate's figure",
        `${eligibility.attendancePct}% and ${eligibility.attendanceCheck} on both sides`,
      );
    } else {
      bad(
        "the portal's figure IS the certificate's figure",
        `portal ${mine?.attendancePct}%/${mine?.attendanceCheck}, eligibility ${eligibility.attendancePct}%/${eligibility.attendanceCheck}`,
      );
    }

    // The three silences, apart.
    const row = (sessionId: string) => mine?.sessions.find((s) => s.sessionId === sessionId);
    if (
      row(absent!.sessionId)?.status === "ABSENT" &&
      row(unmarked!.sessionId)?.status === null &&
      row(unmarked!.sessionId)?.registerTaken === (somebodyElse !== null)
    ) {
      ok(
        "an unmarked student is not called absent",
        somebodyElse === null
          ? "no spare student of this segment — register-taken is not exercised"
          : "the register was taken that day, by somebody else, and their row says so",
      );
    } else {
      bad(
        "an unmarked student is not called absent",
        `absent row ${row(absent!.sessionId)?.status}, unmarked row ${JSON.stringify(row(unmarked!.sessionId))}`,
      );
    }

    // ── The screen, and the warning that travels to Home ──────────────────
    await page.goto(`${BASE}/portal/learning/attendance`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    const register = await page.locator("body").innerText();
    const saysBelow = /below/i.test(register) && register.includes("75%") && register.includes("50%");
    const saysUnmarked = somebodyElse === null || /not recorded for you/i.test(register);
    if (saysBelow && saysUnmarked) {
      ok("the register screen says all three", "the figure, the floor, and which day is not theirs");
    } else {
      bad(
        "the register screen says all three",
        `below=${saysBelow} unmarked=${saysUnmarked}`,
      );
    }

    await page.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    if (/below what the course asks for/i.test(await page.locator("body").innerText())) {
      ok("Home warns them while there are still sessions left to attend");
    } else {
      bad("Home warns them while there are still sessions left to attend", "no warning on home");
    }

    /*
     * ── NOT_EVALUATED is not 0% ────────────────────────────────────────────
     *
     * With every row gone the student has attended none of four delivered
     * sessions, and the arithmetic would happily say 0% — which would refuse a
     * certificate on a register nobody took. `eligibility.service.ts` answers
     * NOT_EVALUATED for exactly this, and the portal must carry that through
     * rather than render a zero.
     */
    await prisma.studentAttendance.deleteMany({ where: { session: { batchId: batch.batchId } } });
    const untaken = await read();
    if (untaken?.attendancePct === null && untaken.attendanceCheck === "NOT_EVALUATED") {
      ok("an untaken register reads as nothing, not as zero", "null and NOT_EVALUATED");
    } else {
      bad(
        "an untaken register reads as nothing, not as zero",
        `pct ${untaken?.attendancePct}, ${untaken?.attendanceCheck}`,
      );
    }

    await page.goto(`${BASE}/portal/learning/attendance`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    /*
     * The FIGURE, not the word.
     *
     * An earlier version grepped the page for "0%" and failed — on the sentence
     * that exists to say "this is not 0%". So the assertion is about the stat
     * block: when there is nothing to count the screen must not render the
     * attendance figure at all, and must say why instead. A check that cannot
     * tell a number from a sentence about that number is a check that will fail
     * the day somebody writes a clearer explanation.
     */
    const empty = await page.locator("body").innerText();
    const explains = /no register has been taken/i.test(empty);
    const showsFigure = (await page.getByText("Your attendance", { exact: true }).count()) > 0;
    if (explains && !showsFigure) {
      ok("…and the screen explains it rather than rendering a figure");
    } else {
      bad(
        "…and the screen explains it rather than rendering a figure",
        showsFigure ? "the attendance figure is on screen with nothing behind it" : "it does not explain",
      );
    }

    // And Home stops warning, because an untaken register is nobody's fault.
    await page.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    if (!/below what the course asks for/i.test(await page.locator("body").innerText())) {
      ok("…and Home does not warn about a register nobody took");
    } else {
      bad("…and Home does not warn about a register nobody took", "the warning is still there");
    }
  } finally {
    /*
     * Put it all back, whatever happened above.
     *
     * In a `finally`, because a failed assertion between here and the top would
     * otherwise leave four sessions marked delivered, a course carrying a floor
     * it never had, and a register this suite invented — and the next run would
     * measure that instead of the product. The college portal's act-gate probe
     * learned this by corrupting exactly these tables.
     */
    await prisma.studentAttendance.deleteMany({ where: { session: { batchId: batch.batchId } } });
    for (const row of attendanceBefore) {
      await prisma.studentAttendance.create({
        data: {
          attendanceId: row.attendanceId,
          sessionId: row.sessionId,
          studentId: row.studentId,
          status: row.status,
          markedAt: new Date(),
        },
      });
    }
    for (const session of sessionsBefore) {
      await prisma.batchSession.update({
        where: { sessionId: session.sessionId },
        data: { status: session.status, completedAt: session.completedAt },
      });
    }
    await prisma.course.update({
      where: { courseId: batch.courseId },
      data: { attendanceFloorPct: courseBefore.attendanceFloorPct },
    });
    if (borrowed !== null) {
      // Hard-deleted, not soft: a `deleted_at` here would be a deallocation
      // that never happened, and the enrolment reports read deleted rows.
      await prisma.studentAttendance.deleteMany({ where: { studentId: borrowed, session: { batchId: batch.batchId } } });
      await prisma.studentBatchMapping.deleteMany({ where: { studentId: borrowed, batchId: batch.batchId } });
    }
  }
}

/**
 * The audience predicate, as `hiring.service.ts` writes it.
 *
 * ── Why a copy is tolerable here, and only here ─────────────────────────
 *
 * It cannot be imported: it lives in the API workspace, behind Nest's
 * decorators, and dragging that into a Playwright script would replace one risk
 * with a worse one. So it is transcribed — and then checked against the real
 * thing before it is trusted, by comparing what it counts with the `reach` the
 * admin API publishes for every targeted posting. A transcription that has
 * drifted fails that comparison, and the checks that depend on it never run on
 * a reference nobody verified.
 *
 * Rules are OR-ed with each other and AND-ed within a rule.
 */
function audienceOf(
  rules: {
    courseId: string;
    batchId: string | null;
    collegeId: string | null;
    cityId: string | null;
    passoutYear: number | null;
    segment: "RETAIL" | "COLLEGE" | null;
    completedOnly: boolean;
  }[],
): Prisma.StudentWhereInput {
  return {
    deletedAt: null,
    accountStatus: "ACTIVE",
    OR: rules.map((rule) => ({
      ...(rule.passoutYear !== null ? { passoutYear: rule.passoutYear } : {}),
      ...(rule.segment !== null ? { enrolmentChannel: rule.segment } : {}),
      ...(rule.collegeId !== null ? { collegeId: rule.collegeId } : {}),
      ...(rule.cityId !== null ? { cityId: rule.cityId } : {}),
      batchMappings: {
        some: {
          deletedAt: null,
          ...(rule.completedOnly ? { completedAt: { not: null } } : {}),
          batch: {
            deletedAt: null,
            courseId: rule.courseId,
            ...(rule.batchId !== null ? { batchId: rule.batchId } : {}),
          },
        },
      },
    })),
  };
}

/** A token from the API itself. `actor` is part of the credential. */
async function signInAtApi(
  email: string,
  actor: "ADMIN_USER" | "STUDENT",
): Promise<string | undefined> {
  const response = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, actor }),
  });
  return ((await response.json()) as { tokens?: { accessToken?: string } }).tokens?.accessToken;
}

/**
 * The public verifier, read the way an employer reads it.
 *
 * A BRAND NEW page, so it carries no cookies from any session this suite holds.
 * That is the check as much as the text is: the point of a verifier is that the
 * people who can use it are not the people who issued the certificate, and a
 * page opened inside a signed-in context would prove nothing about that.
 */
async function publicVerify(browser: Browser, code: string): Promise<string> {
  const stranger = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await stranger.route("**fonts.g**", (r) => r.abort());
  try {
    await stranger.goto(`${BASE}/verify/${encodeURIComponent(code)}`, {
      waitUntil: "domcontentloaded",
    });
    await stranger.waitForLoadState("load");
    return (await stranger.locator("body").innerText()).replace(/\u00a0/g, " ");
  } finally {
    await stranger.close();
  }
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
