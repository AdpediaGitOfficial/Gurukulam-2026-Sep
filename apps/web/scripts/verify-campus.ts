/**
 * The college portal, driven as a college.
 *
 * ── Why it is its own suite ─────────────────────────────────────────────
 *
 * `verify:widths`, `verify:type` and `verify:actions` sign in as an
 * ADMINISTRATOR, `verify:portal` holds a STUDENT and `verify:teach` a TRAINER.
 * A `/campus/*` route visited with any of those is redirected away — correctly —
 * so adding these routes to their arrays would test the redirect and nothing
 * else.
 *
 * It checks the things only this surface has:
 *
 *   · the scope axis, measured against the same database an admin sees whole;
 *   · every act that is OURS refused, with nothing written — the three the
 *     original audit found open answered 200, 200 and 204;
 *   · the college half of invariant 7, from both ends: their own student's file
 *     is theirs, a retail student's is not;
 *   · that no estate-wide figure or operator queue reaches the screen;
 *   · that a revoked account stops working immediately;
 *   · the first sign-in, because portal access is issued with `mustReset` set
 *     and that screen is where every real POC starts;
 *   · every screen at 390px, and every size on the type scale.
 *
 * Results are read back out of the database. Nothing is asserted from what the
 * screen says about itself.
 *
 *   npm run start --workspace @gurukulam/web     # in another shell
 *   npm run verify:campus --workspace @gurukulam/web
 */
import { PrismaClient } from "@gurukulam/db";
import { chromium, type Browser, type Page } from "playwright";

const BASE = process.env["VERIFY_BASE_URL"] ?? "http://127.0.0.1:3000";
const API = process.env["API_INTERNAL_URL"] ?? "http://127.0.0.1:4000/api/v1";
const EXECUTABLE = process.env["CHROMIUM_PATH"] ?? process.env["CHROME"];
const COLLEGE = process.env["VERIFY_COLLEGE"] ?? "CLG-SNC-01";
const ADMIN = "priya@gurukulam.test";
/** The retail student `verify:portal` drives, used here only for the redirect. */
const STUDENT = process.env["VERIFY_STUDENT"] ?? "stu-2026-0891@gurukulam.com";
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
const note = (text: string): void => console.log(`  \x1b[90m· ${text}\x1b[0m`);

/** 390px, because a TPO reads this between meetings on a phone. */
const NARROW = 390;
const SCALE = [36, 30, 25, 20, 18, 16, 14, 12, 10];

async function token(
  email: string,
  actor: "COLLEGE_USER" | "ADMIN_USER" | "STUDENT",
  password = PASSWORD,
): Promise<string | undefined> {
  const response = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, actor }),
  });
  return ((await response.json()) as { tokens?: { accessToken?: string } }).tokens?.accessToken;
}

const authed = (jwt: string) => ({ "Content-Type": "application/json", Authorization: `Bearer ${jwt}` });

async function main(): Promise<void> {
  const college = await prisma.college.findFirstOrThrow({
    where: { collegeCode: COLLEGE, deletedAt: null },
    select: { collegeId: true, name: true },
  });
  const adminToken = await token(ADMIN, "ADMIN_USER");
  if (adminToken === undefined) {
    bad("an administrator can sign in", "the suite measures scope against what an admin sees");
    return finish();
  }

  /*
   * ── Access, issued the way a real college's is ─────────────────────────
   *
   * Re-granted on every run against the SAME contact address, so the grant
   * updates the seeded row instead of piling up accounts — and so the temporary
   * password is known to this process only. It also resets `mustReset`, which is
   * what makes the first-sign-in check below repeatable rather than a
   * one-shot that passed once and can never run again.
   */
  const poc = await prisma.collegeUser.findFirst({
    where: { collegeId: college.collegeId, deletedAt: null },
    select: { email: true },
  });
  const granted = await fetch(`${API}/colleges/${college.collegeId}/access`, {
    method: "POST",
    headers: authed(adminToken),
    body: JSON.stringify({
      name: "Portal verification",
      email: poc?.email ?? "verify-poc@campus.test",
    }),
  });
  const credential = (await granted.json()) as {
    loginEmail?: string;
    temporaryPassword?: string;
    mustResetPassword?: boolean;
  };
  if (granted.status >= 400 || credential.loginEmail === undefined) {
    bad("portal access can be issued", `status ${granted.status}`);
    return finish();
  }
  ok("portal access is issued with a temporary password", `${credential.loginEmail}, must reset`);

  const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {});
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(20000);
  await page.route("**fonts.g**", (r) => r.abort());

  // ── 1. A signed-out visitor reaches the COLLEGE's door ──────────────────
  await page.goto(`${BASE}/campus`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
  if (/\/campus\/login/.test(page.url())) {
    ok("signed out — sent to the college's door", page.url().replace(BASE, ""));
  } else {
    // The actor is part of the credential, so the console's form would tell a
    // POC with the right password that it does not match.
    bad("signed out — sent to the college's door", `landed on ${page.url()}`);
  }

  // ── 2. The first sign-in is the forced password change ──────────────────
  await page.fill('input[name="email"]', credential.loginEmail);
  await page.fill('input[name="password"]', credential.temporaryPassword ?? "");
  await page.click('button[type="submit"]');
  /*
   * Waited on a page that is NOT the door.
   *
   * `pathname.startsWith("/campus")` was already true of `/campus/login`, so the
   * predicate resolved before the form had navigated anywhere and the assertion
   * below read the login screen. The trainer suite recorded this exact trap for
   * `/teach`; it is the same one, one portal later.
   */
  await page
    .waitForURL((url) => url.pathname.startsWith("/campus") && url.pathname !== "/campus/login", {
      timeout: 30000,
    })
    .catch(() => undefined);

  if (page.url() === `${BASE}/campus/account/password?reason=first-login`) {
    ok("a first sign-in lands on the password change", "issued, not chosen");
  } else {
    bad("a first sign-in lands on the password change", `landed on ${page.url()}`);
  }

  // Change it to the suite's password, which is what every later check uses.
  await page.fill('input[name="currentPassword"]', credential.temporaryPassword ?? "");
  await page.fill('input[name="newPassword"]', PASSWORD);
  await page.fill('input[name="confirmPassword"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => url.pathname === "/campus", { timeout: 30000 }).catch(() => undefined);
  // The exact pathname. `includes("/campus")` is true of the login screen, so
  // this check passed while the sign-in above was failing — which is how a
  // weak assertion hides the failure of the one before it.
  if (new URL(page.url()).pathname === "/campus") {
    ok("choosing their own lands in the portal", college.name);
  } else {
    bad("choosing their own lands in the portal", `landed on ${page.url()}`);
  }

  const collegeToken = await token(credential.loginEmail, "COLLEGE_USER");
  if (collegeToken === undefined) {
    bad("the college can sign in at the API", "nothing below can be measured");
    await browser.close();
    return finish();
  }

  // ── 3. The scope axis, against the whole estate ─────────────────────────
  const count = async (path: string, jwt: string): Promise<number> => {
    const response = await fetch(`${API}${path}`, { headers: authed(jwt) });
    if (!response.ok) return -1;
    return ((await response.json()) as { total?: number }).total ?? -1;
  };

  const [mineColleges, mineStudents, mineBatches, mineRequirements] = await Promise.all([
    count("/colleges?pageSize=1", collegeToken),
    count("/students?pageSize=1", collegeToken),
    count("/batches?pageSize=1", collegeToken),
    count("/colleges/requirements?pageSize=1", collegeToken),
  ]);
  const [allColleges, allStudents, allBatches, allRequirements] = await Promise.all([
    count("/colleges?pageSize=1", adminToken),
    count("/students?pageSize=1", adminToken),
    count("/batches?pageSize=1", adminToken),
    count("/colleges/requirements?pageSize=1", adminToken),
  ]);
  const expected = {
    students: await prisma.student.count({ where: { collegeId: college.collegeId, deletedAt: null } }),
    batches: await prisma.batch.count({ where: { collegeId: college.collegeId, deletedAt: null } }),
  };

  if (
    mineColleges === 1 &&
    mineStudents === expected.students &&
    mineBatches === expected.batches &&
    mineStudents < allStudents
  ) {
    ok(
      "the scope axis narrows every list",
      `1 of ${allColleges} colleges, ${mineStudents} of ${allStudents} students, ${mineBatches} of ${allBatches} batches, ${mineRequirements} of ${allRequirements} requirements`,
    );
  } else {
    bad(
      "the scope axis narrows every list",
      `colleges ${mineColleges}, students ${mineStudents} (database ${expected.students}, estate ${allStudents}), batches ${mineBatches} (database ${expected.batches})`,
    );
  }

  // ── 4. Nothing of ours is reachable at all ──────────────────────────────
  const modules = [
    "/dashboard",
    "/fee-ledger",
    "/courses",
    "/trainers",
    "/hiring/postings",
    "/reports/collections",
    "/notifications",
    "/settings/roles",
  ];
  const reachable: string[] = [];
  for (const path of modules) {
    const response = await fetch(`${API}${path}`, { headers: authed(collegeToken) });
    if (response.status < 400) reachable.push(`${path}=${response.status}`);
  }
  if (reachable.length === 0) {
    ok("no operator module is reachable", `${modules.length} refused, not filtered`);
  } else {
    // The dashboard is the one that matters most: it scopes every row-derived
    // figure and then reports the trainer bench, the question bank, the course
    // catalogue, the utilisation spread and an operator queue, none of which
    // scope can filter.
    bad("no operator module is reachable", reachable.join(", "));
  }

  await runActGates(collegeToken, college.collegeId);
  await runInvariantSeven(collegeToken, college.collegeId);
  await runCrossCollege(adminToken, collegeToken, college.collegeId);
  await runTheirWrites(collegeToken, college.collegeId);
  await runScreens(browser, credential.loginEmail);
  await runRevocation(adminToken, credential.loginEmail, college.collegeId);

  await browser.close();
  return finish();
}

/**
 * Every act that is OURS, refused — and nothing written.
 *
 * ── Why each probe is otherwise valid ──────────────────────────────────
 *
 * A request that would have failed anyway proves nothing about the rule. The
 * trainer suite learned this the expensive way: a probe posting a made-up
 * student id came back 500 from a foreign-key failure and `>= 400` counted it as
 * the gate working, passing against a build with the gate removed entirely. So
 * every id here belongs to a real row of this college's, and the only thing that
 * may refuse the request is the act.
 *
 * And each is checked against the DATABASE afterwards, because a 403 that
 * followed a write is not a refusal.
 */
async function runActGates(collegeToken: string, collegeId: string): Promise<void> {
  const cert = await prisma.certificate.findFirst({
    where: { deletedAt: null, status: "ISSUED", student: { collegeId } },
    select: { certificateId: true, status: true },
  });
  const student = await prisma.student.findFirst({
    where: { collegeId, deletedAt: null, accountStatus: "ACTIVE" },
    select: { studentId: true, accountStatus: true },
  });
  const mapping = student
    ? await prisma.studentBatchMapping.findFirst({
        where: { studentId: student.studentId, deletedAt: null },
        select: { batchId: true, isActive: true },
      })
    : null;
  const submission = await prisma.certificateSubmission.findFirst({
    where: { collegeId, deletedAt: null },
    select: { submissionId: true, status: true },
  });
  const row = submission
    ? await prisma.certificateSubmissionRow.findFirst({
        where: { submissionId: submission.submissionId },
        select: { rowId: true, status: true },
      })
    : null;

  if (cert === null || student === null || mapping === null) {
    bad("the acts that are ours are refused", "no real row of this college's to probe with");
    return;
  }

  const acts: { label: string; path: string; body: unknown }[] = [
    { label: "issue a certificate", path: "/certificates", body: { studentId: student.studentId, batchId: mapping.batchId } },
    { label: "revoke a certificate", path: `/certificates/${cert.certificateId}/revoke`, body: { reason: "probe" } },
    { label: "suspend a student", path: `/students/${student.studentId}/suspend`, body: { reason: "probe" } },
    { label: "reinstate a student", path: `/students/${student.studentId}/reinstate`, body: {} },
    { label: "take a student off a batch", path: `/students/${student.studentId}/deallocate`, body: { batchId: mapping.batchId, reason: "probe" } },
    { label: "record a roster outcome", path: `/students/${student.studentId}/roster-outcome`, body: { batchId: mapping.batchId, outcome: "COMPLETED" } },
    ...(row
      ? [{ label: "decide a submitted name", path: `/certificates/submissions/rows/${row.rowId}/decide`, body: { decision: "APPROVE", studentId: student.studentId } }]
      : []),
    ...(submission
      ? [{ label: "release a submission", path: `/certificates/submissions/${submission.submissionId}/release`, body: {} }]
      : []),
    { label: "issue portal access", path: `/colleges/${collegeId}/access`, body: { name: "Probe", email: "probe@nowhere.test" } },
  ];

  const allowed: string[] = [];
  for (const act of acts) {
    const response = await fetch(`${API}${act.path}`, {
      method: "POST",
      headers: authed(collegeToken),
      body: JSON.stringify(act.body),
    });
    // 403 exactly. A 400 would mean the body was rejected before the rule was
    // reached, and a 404 would mean the row was hidden rather than the act
    // refused — both would pass a `>= 400` check while proving nothing.
    if (response.status !== 403) allowed.push(`${act.label}=${response.status}`);
  }

  // And the rows are untouched. A refusal that followed a write is not one.
  const after = {
    cert: (await prisma.certificate.findUniqueOrThrow({
      where: { certificateId: cert.certificateId },
      select: { status: true },
    })).status,
    student: (await prisma.student.findUniqueOrThrow({
      where: { studentId: student.studentId },
      select: { accountStatus: true },
    })).accountStatus,
    onRoster: await prisma.studentBatchMapping.count({
      where: { studentId: student.studentId, batchId: mapping.batchId, deletedAt: null },
    }),
    submission: submission
      ? (await prisma.certificateSubmission.findUniqueOrThrow({
          where: { submissionId: submission.submissionId },
          select: { status: true },
        })).status
      : null,
    rowStatus: row
      ? (await prisma.certificateSubmissionRow.findUniqueOrThrow({
          where: { rowId: row.rowId },
          select: { status: true },
        })).status
      : null,
  };
  const unchanged =
    after.cert === cert.status &&
    after.student === student.accountStatus &&
    after.onRoster === 1 &&
    after.submission === (submission?.status ?? null) &&
    after.rowStatus === (row?.status ?? null);

  if (allowed.length === 0 && unchanged) {
    ok(`${acts.length} acts that are ours are refused`, "403 each, and nothing written");
  } else {
    bad(
      "the acts that are ours are refused",
      allowed.length > 0
        ? `allowed: ${allowed.join(", ")}`
        : `refused, but the database moved: ${JSON.stringify(after)}`,
    );

    /*
     * ── Put it back, precisely because the rule was broken ─────────────────
     *
     * When these probes are refused they change nothing and there is nothing to
     * undo. When one of them GOES THROUGH — which is the whole point of running
     * them — it has revoked a real certificate, suspended a real student and
     * taken them off a real roster. Leaving that behind means the next check
     * reports the wrong failure, and the run after this one measures the mess
     * rather than the code: the trainer suite lost an hour to exactly that.
     *
     * So the repair is here, in the failing branch, and it restores the values
     * read BEFORE the probes rather than assuming what they were.
     */
    await prisma.certificate.update({
      where: { certificateId: cert.certificateId },
      data: { status: cert.status, revokedAt: null, revokedReason: null, revokedBy: null },
    });
    await prisma.student.update({
      where: { studentId: student.studentId },
      data:
        student.accountStatus === "SUSPENDED"
          ? { accountStatus: "SUSPENDED" }
          : { accountStatus: student.accountStatus, suspendedAt: null, suspendedReason: null },
    });
    await prisma.studentBatchMapping.updateMany({
      where: { studentId: student.studentId, batchId: mapping.batchId },
      data: { deletedAt: null, deletedBy: null, exitReason: null, isActive: mapping.isActive, completedAt: null },
    });
    if (submission) {
      await prisma.certificateSubmission.update({
        where: { submissionId: submission.submissionId },
        data: { status: submission.status },
      });
    }
    if (row) {
      await prisma.certificateSubmissionRow.update({
        where: { rowId: row.rowId },
        data: { status: row.status },
      });
    }
    // A certificate the probe managed to ISSUE is not in any snapshot, so it is
    // found by what it would be: this student, this batch, and newer than the
    // one above.
    await prisma.certificate.deleteMany({
      where: {
        studentId: student.studentId,
        batchId: mapping.batchId,
        certificateId: { not: cert.certificateId },
        createdAt: { gte: new Date(Date.now() - 600_000) },
      },
    });
    note("the rows those probes changed have been put back");
  }
}

/**
 * Invariant 7, from the college's side — and from the side that is not theirs.
 *
 * Eligibility is identical across segments; ACCESS is not. The record, the
 * number and the code are the student's in both; only the FILE is the
 * institution's. One check is therefore not enough: a build that allowed every
 * download would pass "the college can fetch its own", which is why the retail
 * half is here.
 */
async function runInvariantSeven(collegeToken: string, collegeId: string): Promise<void> {
  const mine = await prisma.certificate.findFirst({
    where: { deletedAt: null, status: "ISSUED", student: { collegeId } },
    select: { certificateId: true, certificateNumber: true },
  });
  const retail = await prisma.certificate.findFirst({
    where: { deletedAt: null, status: "ISSUED", student: { collegeId: null } },
    select: { certificateId: true },
  });

  if (mine === null) {
    bad("the college half of invariant 7", "no issued certificate of theirs to fetch");
    return;
  }

  const ours = await fetch(`${API}/certificates/${mine.certificateId}/download`, {
    headers: authed(collegeToken),
  });
  if (ours.status === 200) {
    ok("their own student's certificate is theirs to fetch", mine.certificateNumber);
  } else {
    bad("their own student's certificate is theirs to fetch", `status ${ours.status}`);
  }

  if (retail === null) {
    note("no retail certificate exists — the other half of invariant 7 is not exercised");
  } else {
    const other = await fetch(`${API}/certificates/${retail.certificateId}/download`, {
      headers: authed(collegeToken),
    });
    // 404, not 403: a retail student has no college, so no college reaches them,
    // and saying "forbidden" would confirm the record exists.
    if (other.status === 404) {
      ok("a retail student's certificate is not", "not found, never a refusal");
    } else {
      bad("a retail student's certificate is not", `status ${other.status} (want 404)`);
    }
  }
}

/**
 * Another institution's rows, manufactured for the length of the check.
 *
 * ── Why they are created rather than found ─────────────────────────────
 *
 * Every other college in the seed has no students and no requirements, so
 * "a college cannot see another's" was true because there was nothing to see —
 * the same vacuous shape as a certificate check run when every `pdf_url` is
 * null. These are created through the ADMIN api, so they are real rows made the
 * real way, and removed again afterwards.
 */
async function runCrossCollege(
  adminToken: string,
  collegeToken: string,
  collegeId: string,
): Promise<void> {
  const other = await prisma.college.findFirst({
    where: { deletedAt: null, collegeId: { not: collegeId } },
    select: { collegeId: true, collegeCode: true },
  });
  const course = await prisma.course.findFirst({
    where: { deletedAt: null },
    select: { courseId: true },
  });
  if (other === null || course === null) {
    note("only one college exists — the cross-college checks are not exercised");
    return;
  }

  const probeEmail = `cross-boundary-${Date.now()}@probe.test`;
  const madeStudent = await fetch(`${API}/students`, {
    method: "POST",
    headers: authed(adminToken),
    body: JSON.stringify({
      firstName: "Cross",
      lastName: "Boundary",
      email: probeEmail,
      collegeId: other.collegeId,
    }),
  });
  const student = (await madeStudent.json()) as { studentId?: string };

  const madeRequirement = await fetch(`${API}/colleges/requirements`, {
    method: "POST",
    headers: authed(adminToken),
    body: JSON.stringify({
      collegeId: other.collegeId,
      courseId: course.courseId,
      expectedHeadcount: 7,
      preferredMode: "ONLINE",
    }),
  });
  const requirement = (await madeRequirement.json()) as { requirementId?: string };

  try {
    if (student.studentId === undefined || requirement.requirementId === undefined) {
      bad("another college's rows are unreachable", "the probe rows could not be created");
      return;
    }

    const probes: { label: string; path: string }[] = [
      { label: "their student", path: `/students/${student.studentId}` },
      { label: "their requirement", path: `/colleges/requirements/${requirement.requirementId}` },
    ];
    const seen: string[] = [];
    for (const probe of probes) {
      const response = await fetch(`${API}${probe.path}`, { headers: authed(collegeToken) });
      if (response.status !== 404) seen.push(`${probe.label}=${response.status}`);
    }

    /*
     * And absent from the lists, which is the half a `where` fragment decides.
     *
     * SEARCHED for by their own address rather than paged through. A
     * `pageSize=200` sweep passed with the scope filter removed entirely,
     * because the estate holds more students than that and the probe row was on
     * a page nobody fetched — a check whose correctness depends on the size of
     * the seed is a check that stops working when the seed grows.
     */
    const listed = await fetch(
      `${API}/students?pageSize=50&q=${encodeURIComponent(probeEmail)}`,
      { headers: authed(collegeToken) },
    );
    const page = (await listed.json()) as { rows?: { studentId: string }[]; total?: number };
    const inList =
      (page.total ?? 0) > 0 || (page.rows ?? []).some((r) => r.studentId === student.studentId);

    if (seen.length === 0 && !inList) {
      ok(
        "another college's rows read as not found",
        `${other.collegeCode}'s student and requirement, and neither is listed`,
      );
    } else {
      bad(
        "another college's rows read as not found",
        inList ? "the student appeared in their own list" : seen.join(", "),
      );
    }

    // A requirement of another college's cannot be raised either, even by
    // naming it — the service takes the college from the principal.
    const named = await fetch(`${API}/colleges/requirements`, {
      method: "POST",
      headers: authed(collegeToken),
      body: JSON.stringify({
        collegeId: other.collegeId,
        courseId: course.courseId,
        expectedHeadcount: 3,
        preferredMode: "ONLINE",
      }),
    });
    const raised = (await named.json()) as { requirementId?: string; collegeId?: string };
    if (named.status < 400 && raised.collegeId === collegeId) {
      ok("naming another college on a request is ignored", "it is raised against their own");
    } else if (named.status >= 400) {
      // Refusing is also correct — what must not happen is one landing on the
      // other college.
      ok("naming another college on a request is refused", `status ${named.status}`);
    } else {
      bad("naming another college on a request", `it landed on ${raised.collegeId}`);
    }
    if (raised.requirementId !== undefined) {
      await prisma.collegeRequirement.deleteMany({ where: { requirementId: raised.requirementId } });
    }
  } finally {
    // Removed whatever happened above, so a failed run does not leave a college
    // carrying a student it never enrolled.
    if (requirement.requirementId !== undefined) {
      await prisma.collegeRequirement.deleteMany({
        where: { requirementId: requirement.requirementId },
      });
    }
    if (student.studentId !== undefined) {
      await prisma.studentBatchMapping.deleteMany({ where: { studentId: student.studentId } });
      await prisma.student.deleteMany({ where: { studentId: student.studentId } });
    }
  }
}

/** The four acts that ARE theirs, driven through the API they post to. */
async function runTheirWrites(collegeToken: string, collegeId: string): Promise<void> {
  const course = await prisma.course.findFirst({ where: { deletedAt: null }, select: { courseId: true } });
  if (course === null) return;

  const raised = await fetch(`${API}/colleges/requirements`, {
    method: "POST",
    headers: authed(collegeToken),
    body: JSON.stringify({
      courseId: course.courseId,
      expectedHeadcount: 11,
      preferredMode: "OFFLINE",
      source: "COLLEGE_PORTAL",
    }),
  });
  const requirement = (await raised.json()) as { requirementId?: string };
  const row =
    requirement.requirementId === undefined
      ? null
      : await prisma.collegeRequirement.findUnique({
          where: { requirementId: requirement.requirementId },
          select: { collegeId: true, status: true, source: true },
        });

  if (raised.status < 400 && row?.collegeId === collegeId && row.status === "NEW") {
    ok("raising a requirement is theirs", `landed on their own college as ${row.status}, source ${row.source ?? "—"}`);
  } else {
    bad("raising a requirement is theirs", `status ${raised.status}, row ${JSON.stringify(row)}`);
  }

  /*
   * Naming a REAL other college, not a made-up id.
   *
   * Injecting the fault this was written for — `create` trusting the posted id
   * instead of the principal's — did NOT make the student land elsewhere: the
   * `assertInScope` that follows refuses it with a 404. Two independent
   * enforcement points, then, and the check asserts the PROPERTY rather than
   * either of them, which is why both outcomes below are a pass and only a
   * student actually landing at another institution is a failure.
   *
   * The first version posted `00000000-…`, which fails validation with "that
   * college no longer exists" — so a build that trusted the posted id would be
   * caught, but by the wrong refusal, and the failure would not show the actual
   * risk. With a real id the check demonstrates it: either the row lands on
   * their own college, or the portal has just enrolled a student at somebody
   * else's institution.
   */
  const elsewhere = await prisma.college.findFirst({
    where: { deletedAt: null, collegeId: { not: collegeId } },
    select: { collegeId: true, collegeCode: true },
  });
  const added = await fetch(`${API}/students`, {
    method: "POST",
    headers: authed(collegeToken),
    body: JSON.stringify({
      firstName: "Portal",
      lastName: "Intake",
      email: `portal-intake-${Date.now()}@probe.test`,
      collegeId: elsewhere?.collegeId ?? collegeId,
    }),
  });
  const student = (await added.json()) as { studentId?: string };
  const stored =
    student.studentId === undefined
      ? null
      : await prisma.student.findUnique({
          where: { studentId: student.studentId },
          select: { collegeId: true, enrolmentChannel: true },
        });

  if (added.status < 400 && stored?.collegeId === collegeId) {
    ok(
      "adding a student forces their own college",
      `posted ${elsewhere?.collegeCode ?? "another id"}, stored as their own ${stored.enrolmentChannel} intake`,
    );
  } else if (added.status >= 400) {
    // Refusing the request outright is also correct — what must never happen is
    // a student landing at another institution.
    ok("naming another college on an intake is refused", `status ${added.status}`);
  } else {
    bad(
      "adding a student forces their own college",
      `it landed on ${stored?.collegeId ?? "nowhere"} — ${elsewhere?.collegeCode ?? "another college"} was named`,
    );
  }

  // Cleared, so a suite run does not grow the roster it measures.
  if (student.studentId !== undefined) {
    await prisma.student.deleteMany({ where: { studentId: student.studentId } });
  }
  if (requirement.requirementId !== undefined) {
    await prisma.collegeRequirement.deleteMany({
      where: { requirementId: requirement.requirementId },
    });
  }
}

/**
 * Every screen, at a phone's width and on the type scale — and read for what
 * must never appear on it.
 */
async function runScreens(browser: Browser, loginEmail: string): Promise<void> {
  const ROUTES = [
    "/campus",
    "/campus/requirements",
    "/campus/requirements/new",
    "/campus/students",
    "/campus/students/new",
    "/campus/schedule",
    "/campus/certificates",
    "/campus/billing",
    "/campus/account",
    "/campus/more",
  ];

  const phone = await browser.newPage({ viewport: { width: NARROW, height: 844 } });
  await phone.route("**fonts.g**", (r) => r.abort());
  await signIn(phone, loginEmail);

  const sideways: string[] = [];
  const offScale: string[] = [];
  const leaked: string[] = [];

  /*
   * What must not be on a college's screen.
   *
   * The first two are the figures `GET /dashboard` reports that no scope can
   * filter — the size of our trainer bench and of the question bank. The rest
   * are operator language: a queue of sessions missing recordings is our
   * housekeeping, and a trainer's utilisation is our staffing.
   */
  const FORBIDDEN = [
    /question bank/i,
    /utilisation/i,
    /missing recordings/i,
    /bench/i,
    /awaiting approval/i,
    /trainer load/i,
  ];

  for (const route of ROUTES) {
    await phone.goto(BASE + route, { waitUntil: "domcontentloaded" });
    await phone.waitForLoadState("load");

    const verdict = await phone.evaluate(({ scale }) => {
      window.scrollTo(3000, 0);
      const dragged = Math.round(window.scrollX);
      window.scrollTo(0, 0);
      const offenders: string[] = [];
      for (const element of Array.from(document.querySelectorAll("body *"))) {
        const own = Array.from(element.childNodes)
          .filter((node) => node.nodeType === 3)
          .map((node) => (node.textContent ?? "").trim())
          .join(" ")
          .trim();
        if (own === "") continue;
        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") continue;
        const size = Math.round(parseFloat(style.fontSize));
        if (!scale.includes(size)) offenders.push(`${size}px "${own.slice(0, 30)}"`);
      }
      return { dragged, offenders, text: document.body.innerText };
    }, { scale: SCALE });

    if (verdict.dragged > 0) sideways.push(`${route} (${verdict.dragged}px)`);
    for (const offender of verdict.offenders.slice(0, 2)) offScale.push(`${route}: ${offender}`);
    for (const pattern of FORBIDDEN) {
      if (pattern.test(verdict.text)) leaked.push(`${route}: ${pattern.source}`);
    }
  }

  if (sideways.length === 0) ok("every screen fits at 390px", `${ROUTES.length} routes`);
  else bad("every screen fits at 390px", sideways.join(", "));

  if (offScale.length === 0) ok("every size is on the type scale");
  else bad("every size is on the type scale", offScale.slice(0, 4).join(" · "));

  if (leaked.length === 0) ok("no estate-wide figure or operator queue is on screen", "the modules are absent, not filtered");
  else bad("no estate-wide figure or operator queue is on screen", leaked.join(", "));

  await phone.close();

  // ── Each other actor lands on their own surface ────────────────────────
  /*
   * A student whose password this suite knows.
   *
   * Picking "any student with a login" chose one whose credential was issued
   * with a temporary password nobody here holds, so the sign-in failed and the
   * redirect check reported the portal broken. The seeded retail student is the
   * one `verify:portal` drives, and its password is the suite constant.
   */
  const student = await prisma.student.findFirst({
    where: { deletedAt: null, accountStatus: "ACTIVE", loginEmail: STUDENT, mustReset: false },
    select: { loginEmail: true },
  });
  if (student?.loginEmail != null) {
    const theirs = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await theirs.route("**fonts.g**", (r) => r.abort());
    await theirs.goto(`${BASE}/portal/login`, { waitUntil: "domcontentloaded" });
    await theirs.fill('input[name="email"]', student.loginEmail);
    await theirs.fill('input[name="password"]', PASSWORD);
    await theirs.click('button[type="submit"]');
    // Not `startsWith("/portal")`: that is true of `/portal/login`, so the wait
    // resolved before the sign-in had navigated and the session cookie was not
    // yet set when the next `goto` ran — which read as the college portal
    // refusing a student it had never seen. The same trap as the first sign-in
    // above, one page later.
    await theirs
      .waitForURL((url) => url.pathname.startsWith("/portal") && url.pathname !== "/portal/login", {
        timeout: 30000,
      })
      .catch(() => undefined);
    await theirs.goto(`${BASE}/campus`, { waitUntil: "domcontentloaded" });
    await theirs.waitForLoadState("load");
    if (new URL(theirs.url()).pathname.startsWith("/portal")) {
      ok("a student following a college link lands in their own portal", "not on a screen that refuses them");
    } else {
      bad("a student following a college link lands in their own portal", `landed on ${theirs.url()}`);
    }
    await theirs.close();
  } else {
    note("no student credential to check the cross-portal redirect with");
  }
}

/**
 * Revocation stops the account NOW, not at token expiry.
 *
 * The principal builder refuses anything but GRANTED on every request, which is
 * the whole reason it reads the row rather than trusting the token — so a
 * still-valid access token must stop working the moment access is withdrawn.
 * Run last, and the account is granted again afterwards.
 */
async function runRevocation(
  adminToken: string,
  loginEmail: string,
  collegeId: string,
): Promise<void> {
  const user = await prisma.collegeUser.findFirst({
    where: { loginEmail, deletedAt: null },
    select: { collegeUserId: true, email: true },
  });
  if (user === null) {
    bad("a revoked account stops immediately", "the account under test could not be found");
    return;
  }

  const live = await token(loginEmail, "COLLEGE_USER");
  if (live === undefined) {
    bad("a revoked account stops immediately", "could not obtain a token to invalidate");
    return;
  }

  const before = await fetch(`${API}/me/college`, { headers: authed(live) });
  await fetch(`${API}/colleges/access/${user.collegeUserId}/revoke`, {
    method: "POST",
    headers: authed(adminToken),
    body: JSON.stringify({ reason: "verification probe" }),
  });
  const after = await fetch(`${API}/me/college`, { headers: authed(live) });

  if (before.status === 200 && after.status >= 400) {
    ok("a revoked account stops immediately", `${before.status} before, ${after.status} on the same token`);
  } else {
    bad("a revoked account stops immediately", `${before.status} before, ${after.status} after`);
  }

  // Granted again, so the next run starts where this one did.
  await fetch(`${API}/colleges/${collegeId}/access`, {
    method: "POST",
    headers: authed(adminToken),
    body: JSON.stringify({ name: "Portal verification", email: user.email }),
  });
}

async function signIn(page: Page, loginEmail: string): Promise<void> {
  await page.goto(`${BASE}/campus/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', loginEmail);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  // Waited on the pathname, not a regex: `/\/campus/` also matches
  // `/campus/login`, and every later assertion would run against the door.
  await page
    .waitForURL((url) => url.pathname === "/campus" || url.pathname.startsWith("/campus/account"), {
      timeout: 30000,
    })
    .catch(() => undefined);
}

async function finish(): Promise<never> {
  await prisma.$disconnect();
  console.log(
    `\n  ${passed} passed, ${failed} failed\n`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main();
