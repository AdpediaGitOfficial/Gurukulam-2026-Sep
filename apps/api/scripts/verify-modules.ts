/**
 * Exercises the five module surfaces against a RUNNING api and a seeded
 * database.
 *
 * The scope sections carry most of the weight. A module that returns another
 * region's rows still looks correct in every screenshot — it is only wrong to
 * the person who should not have seen them, which is exactly the failure that
 * survives review.
 *
 *     pnpm --filter @gurukulam/api verify:modules
 */
import { PrismaClient } from "@gurukulam/db";
import { MODULES } from "@gurukulam/contracts";

const BASE = process.env.API_URL ?? "http://127.0.0.1:4000/api/v1";
const PASSWORD = "Gurukulam@2026";
const prisma = new PrismaClient({ log: [] });

let passed = 0;
let failed = 0;
const ok = (n: string, d = "") => { passed++; console.log(`  \x1b[32m✓\x1b[0m ${n}${d ? `  \x1b[90m${d}\x1b[0m` : ""}`); };
const bad = (n: string, d: string) => { failed++; console.log(`  \x1b[31m✗\x1b[0m ${n}\n      \x1b[31m${d}\x1b[0m`); };

const show = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? `${x}n` : x));

function expect(name: string, actual: unknown, wanted: unknown) {
  const a = JSON.stringify(actual), w = JSON.stringify(wanted);
  if (a === w) ok(name, String(a)); else bad(name, `expected ${w}, got ${a}`);
}

/**
 * Guards a response before its body is indexed into.
 *
 * Without this a bad response surfaces as "cannot read properties of
 * undefined" several lines later, which says nothing about what actually went
 * wrong. This reports the status and body at the point of failure.
 */
function assertOk<T>(name: string, res: Res<T>, wanted = 200): Res<T> {
  if (res.status !== wanted) {
    bad(name, `expected ${wanted}, got ${res.status}: ${show(res.body)}`);
    throw new Error(`${name}: ${res.status} ${show(res.body)}`);
  }
  ok(name, String(wanted));
  return res;
}

interface Res<T = any> { status: number; body: T }

async function call<T = any>(path: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<Res<T>> {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      // Only declare a JSON body when there is one — though the API now
      // tolerates the other case too, since many clients always set it.
      ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function tokenFor(email: string, actor = "ADMIN_USER"): Promise<string> {
  const res = await call("/auth/login", { method: "POST", body: { email, password: PASSWORD, actor } });
  if (res.status !== 200) throw new Error(`Could not sign in as ${email}: ${JSON.stringify(res.body)}`);
  return res.body.tokens.accessToken;
}

async function main() {
  const admin = await tokenFor("priya@gurukulam.test");          // global
  const regional = await tokenFor("arun@gurukulam.test");        // Bengaluru only
  const college = await tokenFor("tpo@snc.example.test", "COLLEGE_USER"); // SNC only

  const bengaluru = await prisma.city.findFirstOrThrow({ where: { cityCode: "CITY-BLR" } });
  const hyderabad = await prisma.city.findFirstOrThrow({ where: { cityCode: "CITY-HYD" } });
  const india = await prisma.country.findFirstOrThrow({ where: { iso2: "IN" } });
  const snc = await prisma.college.findFirstOrThrow({ where: { collegeCode: "CLG-SNC-01" } });

  // ── Permission coverage ─────────────────────────────────────────────────
  console.log("\n\x1b[1mEvery module is reachable by the role that owns it\x1b[0m");

  // A module missing from a role's permissions is not a cosmetic gap: the
  // guard denies it outright, so an operator silently loses a whole surface
  // and nothing errors. `certificates` and `notifications` went missing this
  // way until M12 happened to exercise one of them.
  for (const roleName of ["Super Admin", "Regional Sub-Admin"]) {
    const role = await prisma.role.findFirstOrThrow({ where: { name: roleName } });
    const perms = role.permissions as Record<string, unknown>;
    const missing = MODULES.filter((m) => !(m in perms));
    expect(`"${roleName}" carries every module in the contract`, missing, []);
  }

  // ── Courses ─────────────────────────────────────────────────────────────
  console.log("\n\x1b[1mCourses — the catalogue\x1b[0m");

  const created = await call("/courses", {
    method: "POST", token: admin,
    body: {
      name: "Cloud Engineering", category: "Infrastructure",
      // Deliberately grouped with paise, to prove the parse path.
      standardMarketValue: "52,500.75",
      durationHours: 90,
      topics: [{ title: "Linux fundamentals" }, { title: "Containers" }, { title: "Kubernetes" }],
    },
  });
  expect("a course is created", created.status, 201);
  const courseId = created.body.courseId as string;
  expect("…with a generated business ID", /^CRS-CE-\d{4}/.test(created.body.courseCode), true);
  expect("…and money parsed to paise without a float", created.body.standardMarketValueMinor, "5250075");
  expect("…returned as a string, not a number", typeof created.body.standardMarketValueMinor, "string");
  expect("…with its topics sequenced by array order", created.body.topicCount, 3);

  const fetched = await call(`/courses/${courseId}`, { token: admin });
  expect("topics come back in sequence", fetched.body.topics.map((t: any) => t.sequence), [1, 2, 3]);
  expect("…titled as submitted", fetched.body.topics[0].title, "Linux fundamentals");

  // A business ID is immutable once issued — every batch and report points at
  // it, so the update schema does not accept one.
  const renamed = await call(`/courses/${courseId}`, {
    method: "PATCH", token: admin,
    body: { name: "Cloud Engineering (2026)", courseCode: "CRS-HACKED" },
  });
  expect("a course updates", renamed.status, 200);
  expect("…and its business ID is unchanged", renamed.body.courseCode, created.body.courseCode);

  const badMoney = await call("/courses", {
    method: "POST", token: admin,
    body: { name: "Broken", standardMarketValue: "not a number", topics: [] },
  });
  expect("a non-numeric price is refused", badMoney.status, 400);
  expect("…keyed to its own field", Object.keys(badMoney.body.error.fields ?? {}), ["standardMarketValue"]);

  // ── Trainers and course approval (invariant 15) ─────────────────────────
  console.log("\n\x1b[1mTrainers — approval is a relationship, not a tag\x1b[0m");

  const trainer = await call("/trainers", {
    method: "POST", token: admin,
    body: {
      name: "Sunil Varma", email: `sunil.${Date.now()}@gurukulam.test`,
      skillTags: ["Kubernetes", "AWS"], cityId: bengaluru.cityId,
      payModel: "PER_SESSION", payRate: "5000",
    },
  });
  expect("a trainer is created", trainer.status, 201);
  expect("…with a generated code", /^TRN-\d{4}$/.test(trainer.body.trainerCode), true);
  expect("…and no password hash on the wire", "passwordHash" in trainer.body, false);
  const trainerId = trainer.body.trainerId as string;

  const beforeApproval = await call(`/trainers?approvedForCourseId=${courseId}`, { token: admin });
  expect("nobody is approved for a new course yet", beforeApproval.body.total, 0);

  const approved = await call(`/trainers/${trainerId}/courses`, {
    method: "PUT", token: admin, body: { courseIds: [courseId] },
  });
  expect("courses can be approved for a trainer", approved.status, 200);
  expect("…and the approval is returned", approved.body.length, 1);

  const afterApproval = await call(`/trainers?approvedForCourseId=${courseId}`, { token: admin });
  expect("the batch trainer picker now finds them", afterApproval.body.total, 1);
  expect("…and it is the right trainer", afterApproval.body.rows[0].trainerId, trainerId);

  const revoked = await call(`/trainers/${trainerId}/courses`, {
    method: "PUT", token: admin, body: { courseIds: [] },
  });
  expect("approval can be revoked", revoked.body.length, 0);
  const afterRevoke = await call(`/trainers?approvedForCourseId=${courseId}`, { token: admin });
  expect("…and the picker forgets them", afterRevoke.body.total, 0);

  // Re-approving must revive the soft-deleted row rather than insert a second,
  // which the live-row unique index would refuse.
  const reApproved = await call(`/trainers/${trainerId}/courses`, {
    method: "PUT", token: admin, body: { courseIds: [courseId] },
  });
  expect("re-approving revives rather than duplicates", reApproved.body.length, 1);

  const duplicateEmail = await call("/trainers", {
    method: "POST", token: admin,
    body: { name: "Impostor", email: trainer.body.email, skillTags: [] },
  });
  expect("a live email cannot be reused", duplicateEmail.status, 409);
  expect("…with the message on the email field", duplicateEmail.body.error.fields?.email, "Already in use");

  // ── Scope: the section that matters ─────────────────────────────────────
  console.log("\n\x1b[1mCity scope — a regional sub-admin sees only their region\x1b[0m");

  const allTrainers = await call("/trainers?pageSize=200", { token: admin });
  const regionalTrainers = await call("/trainers?pageSize=200", { token: regional });
  const regionalCities = new Set(regionalTrainers.body.rows.map((r: any) => r.cityId));
  expect("a global admin sees trainers in every city", allTrainers.body.total > regionalTrainers.body.total, true);
  expect("a scoped admin sees only their own city", [...regionalCities], [bengaluru.cityId]);

  const hyderabadTrainer = await prisma.trainer.findFirstOrThrow({ where: { cityId: hyderabad.cityId, deletedAt: null } });
  const reachAcross = await call(`/trainers/${hyderabadTrainer.trainerId}`, { token: regional });
  expect("fetching an out-of-region record by id is refused", reachAcross.status, 404);
  expect(
    "…as 404, not 403 — a 403 would confirm the record exists",
    reachAcross.body.error.code,
    "NOT_FOUND",
  );

  const crossRegionCreate = await call("/trainers", {
    method: "POST", token: regional,
    body: { name: "Out of region", email: `oor.${Date.now()}@test.test`, skillTags: [], cityId: hyderabad.cityId },
  });
  expect("a scoped admin cannot create outside their region", crossRegionCreate.status, 404);

  console.log("\n\x1b[1mCollege scope — a portal user sees exactly their own college\x1b[0m");

  const adminColleges = await call("/colleges?pageSize=200", { token: admin });
  expect("a global admin sees the colleges", adminColleges.body.total >= 1, true);

  const collegeUserColleges = await call("/colleges?pageSize=200", { token: college });
  expect("a college user sees exactly one", collegeUserColleges.body.total, 1);
  expect("…and it is their own", collegeUserColleges.body.rows[0].collegeId, snc.collegeId);

  // SNC is in Hyderabad; Arun is scoped to Bengaluru.
  const regionalColleges = await call("/colleges?pageSize=200", { token: regional });
  const sncVisibleToRegional = regionalColleges.body.rows.some((c: any) => c.collegeId === snc.collegeId);
  expect("a Bengaluru sub-admin does not see a Hyderabad college", sncVisibleToRegional, false);
  const regionalReach = await call(`/colleges/${snc.collegeId}`, { token: regional });
  expect("…nor reach it by id", regionalReach.status, 404);

  const collegeUserCreate = await call("/colleges", {
    method: "POST", token: college,
    body: { name: "Shadow College", countryId: india.countryId, cityId: hyderabad.cityId, disciplines: [], pocs: [] },
  });
  expect("a college user cannot create another college", collegeUserCreate.status, 403);

  // ── Permissions ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1mThe permission gate is separate from scope\x1b[0m");

  const role = await prisma.role.findFirstOrThrow({ where: { name: "Regional Sub-Admin" } });
  const original = role.permissions;
  await prisma.role.update({
    where: { roleId: role.roleId },
    data: { permissions: { ...(original as object), courses: { read: false, edit: false, delete: false } } },
  });
  const denied = await call("/courses", { token: regional });
  expect("revoking module read returns 403", denied.status, 403);
  expect("…distinct from an out-of-scope 404", denied.body.error.code, "FORBIDDEN");
  await prisma.role.update({ where: { roleId: role.roleId }, data: { permissions: original as object } });

  // ── Question bank ───────────────────────────────────────────────────────
  console.log("\n\x1b[1mQuestion bank — the answer key must name a real option\x1b[0m");

  const goodQuestion = await call("/courses/question-bank", {
    method: "POST", token: admin,
    body: {
      courseId, questionType: "MCQ_SINGLE", difficulty: "EASY",
      questionText: "Which command lists running containers?",
      options: [{ key: "A", text: "docker ps" }, { key: "B", text: "docker ls" }],
      correctAnswers: ["A"], marks: 2, tags: ["docker"],
    },
  });
  expect("a well-formed question is accepted", goodQuestion.status, 201);

  const phantomAnswer = await call("/courses/question-bank", {
    method: "POST", token: admin,
    body: {
      courseId, questionType: "MCQ_SINGLE", questionText: "Broken",
      options: [{ key: "A", text: "one" }, { key: "B", text: "two" }],
      correctAnswers: ["C"],
    },
  });
  // Without this check the question marks every attempt wrong and looks
  // perfectly fine in the list.
  expect("an answer key naming no option is refused", phantomAnswer.status, 400);
  expect("…and says which", phantomAnswer.body.error.fields?.correctAnswers, "No such option: C");

  const twoAnswers = await call("/courses/question-bank", {
    method: "POST", token: admin,
    body: {
      courseId, questionType: "MCQ_SINGLE", questionText: "Broken",
      options: [{ key: "A", text: "one" }, { key: "B", text: "two" }],
      correctAnswers: ["A", "B"],
    },
  });
  expect("a single-answer question with two answers is refused", twoAnswers.status, 400);

  const wrongTopic = await call("/courses/question-bank", {
    method: "POST", token: admin,
    body: {
      courseId, topicId: "00000000-0000-0000-0000-000000000000",
      questionType: "DESCRIPTIVE", questionText: "Explain containers",
    },
  });
  expect("a topic from another course is refused", wrongTopic.status, 400);

  // ── Hiring ──────────────────────────────────────────────────────────────
  console.log("\n\x1b[1mHiring — audience resolved at read time (invariant 10)\x1b[0m");

  const dataAnalytics = await prisma.course.findFirstOrThrow({ where: { courseCode: "CRS-DA-2026" } });

  const preview = await call("/hiring/reach-preview", {
    method: "POST", token: admin,
    body: { audienceRules: [{ courseId: dataAnalytics.courseId, completedOnly: false }] },
  });
  // The seed enrols one retail student and three college students on Data
  // Analytics batches.
  expect("reach is computed from real enrolments", preview.body.reach, 4);

  const retailOnly = await call("/hiring/reach-preview", {
    method: "POST", token: admin,
    body: { audienceRules: [{ courseId: dataAnalytics.courseId, segment: "RETAIL", completedOnly: false }] },
  });
  expect("segment narrows the audience", retailOnly.body.reach, 1);

  const collegeOnly = await call("/hiring/reach-preview", {
    method: "POST", token: admin,
    body: { audienceRules: [{ courseId: dataAnalytics.courseId, segment: "COLLEGE", completedOnly: false }] },
  });
  expect("…and the two segments partition it", collegeOnly.body.reach, 3);

  const completedOnly = await call("/hiring/reach-preview", {
    method: "POST", token: admin,
    body: { audienceRules: [{ courseId: dataAnalytics.courseId, completedOnly: true }] },
  });
  expect("completed-only excludes students still enrolled", completedOnly.body.reach, 0);

  const emptyAudience = await call("/hiring", {
    method: "POST", token: admin,
    body: { roleTitle: "Draft Role", companyName: "Nowhere Ltd", skills: [], audienceRules: [] },
  });
  expect("a posting can be drafted without an audience", emptyAudience.status, 201);
  expect("…and starts as a draft", emptyAudience.body.status, "DRAFT");

  const publishEmpty = await call(`/hiring/${emptyAudience.body.jobPostingId}/publish`, { method: "POST", token: admin });
  // Publishing to nobody looks identical to a broken feed.
  expect("publishing with no audience is refused", publishEmpty.status, 400);

  const targeted = await call("/hiring", {
    method: "POST", token: admin,
    body: {
      roleTitle: "Junior Cloud Engineer", companyName: "Northwind",
      workMode: "REMOTE", compensationMin: "600000", compensationMax: "900000",
      compensationPeriod: "ANNUAL", skills: ["Kubernetes"],
      audienceRules: [{ courseId: dataAnalytics.courseId, completedOnly: false }],
    },
  });
  expect("a targeted posting is created", targeted.status, 201);
  expect("…with compensation in paise as a string", targeted.body.compensationMinMinor, "60000000");

  const published = await call(`/hiring/${targeted.body.jobPostingId}/publish`, { method: "POST", token: admin });
  expect("it publishes", published.status, 200);
  expect("…and reports the reach it will actually have", published.body.reach, 4);

  const republish = await call(`/hiring/${targeted.body.jobPostingId}/publish`, { method: "POST", token: admin });
  expect("publishing twice is refused", republish.status, 409);

  // ── Soft delete ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1mSoft delete (ADR 0002)\x1b[0m");

  const removed = await call(`/courses/${courseId}`, { method: "DELETE", token: admin });
  expect("a course is soft-deleted", removed.status, 204);

  const afterDelete = await call(`/courses/${courseId}`, { token: admin });
  expect("…and disappears from operational reads", afterDelete.status, 404);

  const stillInDb = await prisma.course.findUnique({ where: { courseId } });
  expect("…but the row is still there", stillInDb !== null, true);
  expect("…marked with when and by whom", stillInDb?.deletedAt !== null && stillInDb?.deletedBy !== null, true);

  const includingDeleted = await call(`/courses?includeDeleted=true&q=Cloud%20Engineering`, { token: admin });
  const found = includingDeleted.body.rows.some((c: any) => c.courseId === courseId);
  expect("a report can opt back in to removed rows", found, true);

  const liveBatchCourse = await call(`/courses/${dataAnalytics.courseId}`, { method: "DELETE", token: admin });
  expect("a course with running batches cannot be removed", liveBatchCourse.status, 409);

  console.log(`\n${failed === 0 ? "\x1b[32m" : "\x1b[31m"}${passed} passed, ${failed} failed\x1b[0m\n`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
