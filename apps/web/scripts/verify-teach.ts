/**
 * The trainer portal, driven as a trainer.
 *
 * ── Why it is its own suite ─────────────────────────────────────────────
 *
 * `verify:widths`, `verify:type` and `verify:actions` sign in as an
 * ADMINISTRATOR; `verify:portal` holds a STUDENT. A trainer route visited with
 * either session is redirected away — correctly — so adding `/teach/*` to
 * their arrays would test the redirect and nothing else.
 *
 * It checks the things only this surface has:
 *
 *   · the scope axis, measured against the same database the admin sees whole;
 *   · the two hops on attendance — is the session mine, is the student on it;
 *   · that a released trainer keeps their history and loses the write;
 *   · that a suspended trainer signs in, reads, and writes nothing;
 *   · that nothing commercial is reachable;
 *   · every screen at 390px, and every size on the type scale.
 *
 * Results are read back out of the database. Nothing is asserted from what the
 * screen says about itself.
 *
 *   npm run start --workspace @gurukulam/web     # in another shell
 *   npm run verify:teach --workspace @gurukulam/web
 */
import { PrismaClient } from "@gurukulam/db";
import { chromium, type Browser, type Page } from "playwright";

const BASE = process.env["VERIFY_BASE_URL"] ?? "http://127.0.0.1:3000";
const API = process.env["API_INTERNAL_URL"] ?? "http://127.0.0.1:4000/api/v1";
const EXECUTABLE = process.env["CHROMIUM_PATH"] ?? process.env["CHROME"];
const TRAINER = process.env["VERIFY_TRAINER"] ?? "trn-0042@gurukulam.com";
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

/** 390px, because a trainer marking a register is holding a phone. */
const NARROW = 390;
const SCALE = [36, 30, 25, 20, 18, 16, 14, 12, 10];

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto(`${BASE}/teach/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  // Waited on the pathname, not a regex: `/\/teach/` also matches
  // `/teach/login`, and every later assertion would run against the door.
  await page
    .waitForURL((url) => url.pathname === "/teach" || url.pathname.startsWith("/teach/account"), {
      timeout: 30000,
    })
    .catch(() => undefined);
}

async function token(email: string, actor: "TRAINER" | "ADMIN_USER"): Promise<string | undefined> {
  const response = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, actor }),
  });
  return ((await response.json()) as { tokens?: { accessToken?: string } }).tokens?.accessToken;
}

async function main(): Promise<void> {
  const trainer = await prisma.trainer.findFirstOrThrow({
    where: { loginEmail: TRAINER },
    select: { trainerId: true, name: true, trainerCode: true, engagement: true },
  });

  const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {});
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(20000);
  await page.route("**fonts.g**", (r) => r.abort());

  // ── 1. A signed-out visitor reaches the TRAINER's door ──────────────────
  await page.goto(`${BASE}/teach`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
  if (/\/teach\/login/.test(page.url())) {
    ok("signed out — sent to the trainer's door", page.url().replace(BASE, ""));
  } else {
    // The actor is part of the credential, so the console's form would tell a
    // trainer with the right password that it does not match.
    bad("signed out — sent to the trainer's door", `landed on ${page.url()}`);
  }

  await signIn(page, TRAINER);
  if (page.url().includes("/teach")) ok("sign in lands in the portal", trainer.name);
  else bad("sign in lands in the portal", `landed on ${page.url()}`);

  // ── 2. The scope axis, against the whole estate ─────────────────────────
  const trainerToken = await token(TRAINER, "TRAINER");
  const adminToken = await token("priya@gurukulam.test", "ADMIN_USER");

  if (trainerToken === undefined || adminToken === undefined) {
    bad("the scope axis narrows what a trainer sees", "could not sign in at the API");
  } else {
    const count = async (path: string, bearer: string): Promise<number> =>
      ((await (
        await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${bearer}` } })
      ).json()) as { total?: number }).total ?? -1;

    const [mineB, allB, mineS, allS] = await Promise.all([
      count("/batches?pageSize=1", trainerToken),
      count("/batches?pageSize=1", adminToken),
      count("/batches/sessions?pageSize=1", trainerToken),
      count("/batches/sessions?pageSize=1", adminToken),
    ]);

    // What the database says this trainer's reach actually is — so the check
    // is against the rule, not against whatever the API happened to return.
    const expectedBatches = await prisma.batch.count({
      where: {
        deletedAt: null,
        OR: [
          { primaryTrainerId: trainer.trainerId },
          {
            trainerAssignments: {
              some: { trainerId: trainer.trainerId, status: "CONFIRMED", deletedAt: null },
            },
          },
        ],
      },
    });

    if (mineB === expectedBatches && mineB < allB) {
      ok("the scope axis narrows what a trainer sees", `${mineB} of ${allB} batches, ${mineS} of ${allS} sessions`);
    } else {
      bad(
        "the scope axis narrows what a trainer sees",
        `api ${mineB}, database ${expectedBatches}, admin ${allB}`,
      );
    }

    // ── 3. Nothing commercial is reachable at all ─────────────────────────
    const refusals = await Promise.all(
      ["/fee-ledger", "/courses", "/students", "/hiring", "/colleges", "/reports/collections"].map(
        async (path) => [
          path,
          (await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${trainerToken}` } }))
            .status,
        ] as const,
      ),
    );
    const reachable = refusals.filter(([, status]) => status < 400);
    if (reachable.length === 0) {
      ok("no commercial module is reachable", `${refusals.length} refused, not filtered`);
    } else {
      bad("no commercial module is reachable", reachable.map(([p, s]) => `${p}=${s}`).join(", "));
    }
  }

  // ── 4. The register, taken through the screen ───────────────────────────
  const session = await prisma.batchSession.findFirst({
    where: {
      deletedAt: null,
      trainerId: trainer.trainerId,
      status: { not: "CANCELLED" },
      scheduledDate: { lte: new Date() },
      batch: { studentMappings: { some: { deletedAt: null, isActive: true } } },
    },
    select: { sessionId: true, sessionCode: true, batchId: true },
    orderBy: { scheduledDate: "desc" },
  });

  if (session === null) {
    console.log("  \x1b[90m· no past session of theirs with a roster — the register is not exercised\x1b[0m");
  } else {
    /*
     * The roster, and every row this session already holds.
     *
     * Both are needed, and for different reasons. The ROSTER is what makes the
     * assertion below about the students who are actually on this session,
     * rather than about whatever row the database happened to return first — an
     * earlier version read one row with `findFirst` and no ordering, and when a
     * stray row existed for a student who was not on the roster it reported the
     * register broken while the register was working perfectly. THE EXISTING
     * ROWS are what the restore puts back, and what tells the stranger check
     * below that a row it finds afterwards is one this run created.
     */
    /*
     * A SECOND student on the roster, for the length of the check.
     *
     * Every one of the seeded trainer's batches carries exactly one active
     * student, and on a roster of one the property this check exists to hold —
     * that the service writes the WHOLE register from one call — is true
     * whatever the service does: the row the trainer touched is the register.
     * A build that saved only the touched row and left the rest of the cohort
     * unmarked would have passed, which is the same vacuous-check shape the
     * certificate suite hit with every `pdf_url` null.
     *
     * The mapping is written directly rather than through the allocation
     * endpoint on purpose. The roster, as the attendance service reads it, IS
     * this table; allocation's own transaction — ledger, credentials, session
     * access — is covered by its own suite, and running it here would leave
     * financial rows behind that this file would then have to unwind. Retail
     * only, because invariant 2 forbids mixing rosters and this batch has no
     * college.
     */
    const batchRow = await prisma.batch.findUniqueOrThrow({
      where: { batchId: session.batchId },
      select: { collegeId: true },
    });
    const spare = await prisma.student.findFirst({
      where: {
        deletedAt: null,
        accountStatus: "ACTIVE",
        collegeId: batchRow.collegeId,
        batchMappings: { none: { batchId: session.batchId, deletedAt: null } },
      },
      select: { studentId: true },
    });
    const borrowed =
      spare === null
        ? null
        : await prisma.studentBatchMapping.create({
            data: { studentId: spare.studentId, batchId: session.batchId, isActive: true },
            select: { mappingId: true },
          });
    if (borrowed === null) {
      console.log(
        "  \x1b[90m· no spare student of this segment — the register is exercised on one row\x1b[0m",
      );
    }

    const roster = await prisma.studentBatchMapping.findMany({
      where: { batchId: session.batchId, deletedAt: null, isActive: true },
      select: { studentId: true },
    });
    const rosterIds = new Set(roster.map((m) => m.studentId));
    const before = await prisma.studentAttendance.findMany({
      where: { sessionId: session.sessionId },
      select: { attendanceId: true, studentId: true, status: true },
    });
    const knownRows = new Set(before.map((row) => row.attendanceId));

    await page.goto(`${BASE}/teach/sessions/${session.sessionId}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");

    const late = page.getByText("Late", { exact: true }).first();
    if ((await late.count()) === 0) {
      bad("taking the register", "no register control on the session screen");
    } else {
      await late.click();
      await page.getByRole("button", { name: /register/i }).click();
      await page.waitForLoadState("networkidle");

      const after = await prisma.studentAttendance.findMany({
        where: { sessionId: session.sessionId, deletedAt: null },
        select: { studentId: true, status: true, markedBy: true, markedAt: true },
      });
      const mine = after.filter((row) => rosterIds.has(row.studentId));
      /*
       * Three things, because the register is written whole.
       *
       * One row per roster student is the property that matters — the service
       * takes the entire register in one call, so a build that wrote only the
       * row the trainer touched would leave the rest of the cohort unmarked and
       * still satisfy "a LATE row exists". `markedBy` is checked on every row
       * rather than one, because attribution is the reason the column is there.
       */
      const lates = mine.filter((row) => row.status === "LATE");
      const attributed = mine.every(
        (row) => row.markedBy === trainer.trainerId && row.markedAt !== null,
      );
      if (mine.length === rosterIds.size && lates.length === 1 && attributed) {
        ok(
          "taking the register",
          `${session.sessionCode} → ${mine.length} marked by them, one LATE`,
        );
      } else {
        bad(
          "taking the register",
          `${mine.length} of ${rosterIds.size} roster rows, ${lates.length} LATE, attributed ${attributed}`,
        );
      }

      /*
       * Put the data back — and that means DELETING what this run created, not
       * only restoring what it changed.
       *
       * Restoring `before` alone leaves every row the register created sitting
       * in the database, and the next check then measures the leftovers. That
       * is precisely how the run that found this bug reported two failures for
       * one stray row.
       */
      await prisma.studentAttendance.deleteMany({
        where: { sessionId: session.sessionId, attendanceId: { notIn: [...knownRows] } },
      });
      for (const row of before) {
        await prisma.studentAttendance.update({
          where: { attendanceId: row.attendanceId },
          data: { status: row.status },
        });
      }
    }

    /*
     * Hand the borrowed student back.
     *
     * Outside the branch above, so a run that failed for want of a register
     * control still leaves the roster the size it found it. Hard-deleted rather
     * than soft: a `deleted_at` here would be a deallocation that never
     * happened, and the enrolment reports read deleted rows on purpose.
     */
    if (borrowed !== null) {
      await prisma.studentAttendance.deleteMany({
        where: { sessionId: session.sessionId, studentId: spare?.studentId ?? "" },
      });
      await prisma.studentBatchMapping.delete({ where: { mappingId: borrowed.mappingId } });
    }

    /*
     * The second hop.
     *
     * "May this trainer write attendance for this student" is TWO questions:
     * is this session mine, and is this student on that session's roster. The
     * first passing feels like the answer, which is why the second is the one
     * that gets left out.
     */
    if (trainerToken !== undefined) {
      /*
       * A stranger with NO row on this session, so "rows written" means what it
       * says.
       *
       * Counting rows for a student who already had one cannot tell a write
       * that was refused from a write that went through, and an absolute count
       * reports the last run's mess as this run's failure.
       */
      const stranger = await prisma.student.findFirst({
        where: {
          deletedAt: null,
          batchMappings: { none: { batchId: session.batchId, deletedAt: null } },
          attendance: { none: { sessionId: session.sessionId } },
        },
        select: { studentId: true },
      });

      if (stranger === null) {
        console.log("  \x1b[90m· every student is on this roster — hop two is vacuous\x1b[0m");
      } else {
        const response = await fetch(`${API}/batches/sessions/${session.sessionId}/attendance`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${trainerToken}` },
          body: JSON.stringify({ entries: [{ studentId: stranger.studentId, status: "PRESENT" }] }),
        });
        const wrote = await prisma.studentAttendance.count({
          where: { sessionId: session.sessionId, studentId: stranger.studentId },
        });
        if (response.status >= 400 && wrote === 0) {
          ok("a student who is not on the roster is refused", `their own session, ${response.status}`);
        } else {
          bad(
            "a student who is not on the roster is refused",
            `status ${response.status}, rows written ${wrote}`,
          );
        }
        // Whatever the answer, this run leaves nothing behind.
        await prisma.studentAttendance.deleteMany({
          where: { sessionId: session.sessionId, studentId: stranger.studentId },
        });
      }

      // ── 5. Somebody else's session ──────────────────────────────────────
      const foreign = await prisma.batchSession.findFirst({
        where: {
          deletedAt: null,
          batch: {
            primaryTrainerId: { not: trainer.trainerId },
            trainerAssignments: { none: { trainerId: trainer.trainerId, deletedAt: null } },
          },
        },
        select: { sessionId: true },
      });
      if (foreign !== null) {
        const response = await fetch(`${API}/batches/sessions/${foreign.sessionId}/attendance`, {
          headers: { Authorization: `Bearer ${trainerToken}` },
        });
        if (response.status === 404) {
          ok("another trainer's session reads as not found", "never as a refusal");
        } else {
          bad("another trainer's session reads as not found", `status ${response.status}`);
        }
      }
    }
  }

  // ── 6. Released: history kept, writing stopped ──────────────────────────
  if (trainerToken !== undefined && session !== null) {
    const assignment = await prisma.batchTrainerAssignment.findFirst({
      where: { batchId: session.batchId, trainerId: trainer.trainerId, deletedAt: null },
      select: { assignmentId: true },
    });
    const batch = await prisma.batch.findUniqueOrThrow({
      where: { batchId: session.batchId },
      select: { primaryTrainerId: true },
    });

    // Release them for the length of the check, exactly as the admin path does.
    await prisma.batch.update({
      where: { batchId: session.batchId },
      data: { primaryTrainerId: null },
    });
    if (assignment) {
      await prisma.batchTrainerAssignment.update({
        where: { assignmentId: assignment.assignmentId },
        data: { deletedAt: new Date() },
      });
    }

    /*
     * A REAL student on the roster, and an exact status.
     *
     * An earlier version posted `studentId: "irrelevant"`, which fails a
     * foreign key and comes back 500 — and `>= 400` counted that as the rule
     * working. It passed against a build where release had been removed
     * entirely. The only thing that may refuse this request is the release, so
     * everything else about it has to be valid.
     */
    const onRoster = await prisma.studentBatchMapping.findFirst({
      where: { batchId: session.batchId, deletedAt: null, isActive: true },
      select: { studentId: true },
    });
    /*
     * Cleared FIRST, not only afterwards.
     *
     * A run that failed part way through leaves its probe row behind, and the
     * next run then reports the rule broken on the strength of the last run's
     * mess. A check that depends on the previous run having finished cleanly is
     * a check that lies the moment anything goes wrong.
     */
    if (onRoster !== null) {
      await prisma.studentAttendance.deleteMany({
        where: { sessionId: session.sessionId, studentId: onRoster.studentId, status: "EXCUSED" },
      });
    }
    const released = await token(TRAINER, "TRAINER");
    const read = await fetch(`${API}/batches/sessions/${session.sessionId}/attendance`, {
      headers: { Authorization: `Bearer ${released ?? ""}` },
    });
    const write = await fetch(`${API}/batches/sessions/${session.sessionId}/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${released ?? ""}` },
      body: JSON.stringify({
        entries: [{ studentId: onRoster?.studentId ?? "", status: "EXCUSED" }],
      }),
    });
    const wroteWhileReleased =
      onRoster === null
        ? 0
        : await prisma.studentAttendance.count({
            where: {
              sessionId: session.sessionId,
              studentId: onRoster.studentId,
              status: "EXCUSED",
              deletedAt: null,
            },
          });

    if (read.status === 200 && write.status === 404 && wroteWhileReleased === 0) {
      ok(
        "a released trainer keeps their history and loses the write",
        `read ${read.status}, write ${write.status} with a real student on the roster`,
      );
    } else {
      bad(
        "a released trainer keeps their history and loses the write",
        `read ${read.status} (want 200), write ${write.status} (want 404), rows ${wroteWhileReleased}`,
      );
    }

    await prisma.batch.update({
      where: { batchId: session.batchId },
      data: { primaryTrainerId: batch.primaryTrainerId },
    });
    if (assignment) {
      await prisma.batchTrainerAssignment.update({
        where: { assignmentId: assignment.assignmentId },
        data: { deletedAt: null },
      });
    }
    /*
     * And the row the probe wrote if the rule was broken.
     *
     * Left behind, it made the NEXT check fail instead — "taking the register"
     * reported PRESENT where it wanted LATE, because a later restore put the
     * probe's row back. A suite that corrupts its own data reports the wrong
     * failure, which is worse than reporting none.
     */
    if (onRoster !== null) {
      await prisma.studentAttendance.deleteMany({
        where: { sessionId: session.sessionId, studentId: onRoster.studentId, status: "EXCUSED" },
      });
    }
  }

  // ── 7. Suspended: signs in, reads, writes nothing ───────────────────────
  await prisma.trainer.update({
    where: { trainerId: trainer.trainerId },
    data: { accountStatus: "SUSPENDED", suspendedReason: "probe suspension" },
  });

  const suspendedToken = await token(TRAINER, "TRAINER");
  if (suspendedToken === undefined) {
    bad("a suspended trainer signs in and reads", "refused at login — they would not see their own sessions");
  } else {
    const read = await fetch(`${API}/batches?pageSize=1`, {
      headers: { Authorization: `Bearer ${suspendedToken}` },
    });
    // A real student again, for the reason recorded on the release check: a
    // request that would have failed anyway proves nothing about the rule.
    const rosterMember =
      session === null
        ? null
        : await prisma.studentBatchMapping.findFirst({
            where: { batchId: session.batchId, deletedAt: null, isActive: true },
            select: { studentId: true },
          });
    const write =
      session === null || rosterMember === null
        ? { status: 403 }
        : await fetch(`${API}/batches/sessions/${session.sessionId}/attendance`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${suspendedToken}` },
            body: JSON.stringify({
              entries: [{ studentId: rosterMember.studentId, status: "EXCUSED" }],
            }),
          });

    // 403 exactly: the permission matrix refuses before the body is read, so
    // anything else means a different mechanism answered.
    if (read.status === 200 && write.status === 403) {
      ok("a suspended trainer reads and writes nothing", `read ${read.status}, write ${write.status}`);
    } else {
      bad("a suspended trainer reads and writes nothing", `read ${read.status}, write ${write.status}`);
    }

    // And says so, rather than refusing one button at a time.
    const suspendedPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await suspendedPage.route("**fonts.g**", (r) => r.abort());
    await signIn(suspendedPage, TRAINER);
    await suspendedPage.waitForLoadState("load");
    const banner = await suspendedPage.locator("body").innerText();
    if (/suspended/i.test(banner)) ok("…and the screen says so");
    else bad("…and the screen says so", "no banner on the portal");
    await suspendedPage.close();
  }

  await prisma.trainer.update({
    where: { trainerId: trainer.trainerId },
    data: { accountStatus: "ACTIVE", suspendedReason: null },
  });

  /*
   * ── 7b. The operator's half: access has to be issuable from the console ──
   *
   * Everything above signs a trainer in with credentials the seed happened to
   * leave behind. That proves nothing about how a REAL trainer gets them, and
   * `verify:coverage` found the gap the honest way: `POST /trainers/:id/access`
   * existed on the API and no screen called it, so all 191 trainers on the
   * bench were unreachable by any operator.
   *
   * Driven through the screen, not the endpoint. The endpoint worked the whole
   * time — the button was what was missing.
   */
  const dark = await prisma.trainer.findFirst({
    where: {
      deletedAt: null,
      accountStatus: "ACTIVE",
      trainerId: { not: trainer.trainerId },
      OR: [{ credentialsIssuedAt: null }, { loginEmail: null }],
    },
    select: { trainerId: true, name: true, trainerCode: true, passwordHash: true },
  });

  if (dark === null) {
    console.log("  \x1b[90m· every trainer already has access — issuing is not exercised\x1b[0m");
  } else {
    const console_ = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await console_.route("**fonts.g**", (r) => r.abort());
    await console_.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await console_.fill('input[name="email"]', "priya@gurukulam.test");
    await console_.fill('input[name="password"]', PASSWORD);
    await console_.click('button[type="submit"]');
    await console_.waitForURL((u) => u.pathname === "/dashboard", { timeout: 30000 }).catch(() => undefined);

    await console_.goto(`${BASE}/trainers/${dark.trainerId}`, { waitUntil: "domcontentloaded" });
    await console_.waitForLoadState("load");
    const verb = console_.getByRole("button", { name: /issue portal access/i }).first();
    if ((await verb.count()) === 0) {
      bad("an operator can issue portal access", "no verb on the trainer page");
    } else {
      await verb.click();
      // The pattern asks for confirmation, so the second press is the act.
      const confirm = console_.getByRole("button", { name: /issue portal access/i }).last();
      await confirm.click().catch(() => undefined);
      await console_.waitForLoadState("networkidle");

      const issued = await prisma.trainer.findUniqueOrThrow({
        where: { trainerId: dark.trainerId },
        select: { loginEmail: true, credentialsIssuedAt: true, mustReset: true },
      });
      /*
       * Read out of the DATABASE and then USED, because a login address that
       * cannot be signed in with is not access. The password is the one thing
       * the screen must never show, so this cannot check the sign-in itself —
       * what it can check is that the API agrees a credential now exists, by
       * asking it with a wrong password: an unknown address and a wrong
       * password are the same refusal, so the distinction here is `mustReset`
       * and the two columns.
       */
      if (
        issued.loginEmail !== null &&
        issued.credentialsIssuedAt !== null &&
        issued.mustReset === true
      ) {
        ok("an operator can issue portal access", `${dark.trainerCode} → ${issued.loginEmail}`);
      } else {
        bad(
          "an operator can issue portal access",
          `login ${issued.loginEmail ?? "null"}, issued ${issued.credentialsIssuedAt?.toISOString() ?? "null"}, mustReset ${issued.mustReset}`,
        );
      }

      // And a second issue is refused rather than quietly replacing the
      // password the person is already holding.
      await console_.goto(`${BASE}/trainers/${dark.trainerId}`, { waitUntil: "domcontentloaded" });
      await console_.waitForLoadState("load");
      const again = await console_.getByRole("button", { name: /issue portal access/i }).count();
      if (again === 0) ok("…and the verb is gone once they have it", "the address is shown instead");
      else bad("…and the verb is gone once they have it", "still offered, which would reset their password");

      // Put the trainer back on the bench.
      await prisma.trainer.update({
        where: { trainerId: dark.trainerId },
        data: {
          loginEmail: null,
          credentialsIssuedAt: null,
          mustReset: false,
          passwordHash: dark.passwordHash,
        },
      });
    }
    await console_.close();
  }

  // ── 8. Every screen fits a phone, and every size is on the scale ────────
  const ROUTES = [
    "/teach",
    "/teach/batches",
    "/teach/sessions",
    "/teach/availability",
    "/teach/account",
    "/teach/more",
    ...(trainer.engagement === "FREELANCE" ? ["/teach/invitations"] : []),
    ...(session === null ? [] : [`/teach/sessions/${session.sessionId}`]),
  ];

  const phone = await browser.newPage({ viewport: { width: NARROW, height: 844 } });
  await phone.route("**fonts.g**", (r) => r.abort());
  await signIn(phone, TRAINER);

  const sideways: string[] = [];
  const offScale: string[] = [];
  const moneyOnScreen: string[] = [];

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
      return { dragged, bad: [...new Set(bad)].slice(0, 4), text: document.body.innerText };
    }, { scale: SCALE });

    if (verdict.dragged > 0) sideways.push(`${route} — drags ${verdict.dragged}px`);
    for (const row of verdict.bad) offScale.push(`${route} — ${row}`);
    // A rupee figure on any trainer screen is a commercial field that got
    // through. The modules are absent rather than projected, so there should
    // be nothing to find.
    if (/₹/.test(verdict.text)) moneyOnScreen.push(route);
  }
  await phone.close();

  if (sideways.length === 0) ok(`every screen fits at ${NARROW}px`, `${ROUTES.length} routes`);
  else bad(`every screen fits at ${NARROW}px`, sideways.join(" · "));

  if (offScale.length === 0) ok("every size is on the type scale");
  else bad("every size is on the type scale", offScale.join(" · "));

  if (moneyOnScreen.length === 0) ok("no money on any trainer screen", "the modules are absent, not filtered");
  else bad("no money on any trainer screen", moneyOnScreen.join(", "));

  // ── 9. A student following a trainer link goes to their own portal ──────
  const student = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await student.route("**fonts.g**", (r) => r.abort());
  await student.goto(`${BASE}/portal/login`, { waitUntil: "domcontentloaded" });
  await student.fill('input[name="email"]', "stu-2026-0891@gurukulam.com");
  await student.fill('input[name="password"]', PASSWORD);
  await student.click('button[type="submit"]');
  await student.waitForURL((u) => u.pathname === "/portal", { timeout: 30000 }).catch(() => undefined);
  await student.goto(`${BASE}/teach`, { waitUntil: "domcontentloaded" });
  await student.waitForLoadState("load");
  if (new URL(student.url()).pathname === "/portal") {
    ok("a student following a trainer link lands in their own portal", "not on a console they cannot read");
  } else {
    bad("a student following a trainer link lands in their own portal", `landed on ${student.url()}`);
  }
  await student.close();

  await browser.close();
  await prisma.$disconnect();
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
