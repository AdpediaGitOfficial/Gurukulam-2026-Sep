/**
 * M6 — batches, sessions, the trainer handshake and what hangs off a session.
 *
 * The assertions here are the delivery invariants from architecture.md §4.
 * Each one is cheap to break and expensive to notice: a trainer confirmed
 * without approval, an assignment attached to a session that never happened,
 * a reschedule that orphans attendance.
 *
 *     pnpm --filter @gurukulam/api verify:delivery
 */
import { PrismaClient } from "@gurukulam/db";
import { clearRateLimit } from "./_rate-limit";

const BASE = process.env.API_URL ?? "http://127.0.0.1:4000/api/v1";
const PASSWORD = "Gurukulam@2026";
const prisma = new PrismaClient({ log: [] });

let passed = 0, failed = 0;
const ok = (n: string, d = "") => { passed++; console.log(`  \x1b[32m✓\x1b[0m ${n}${d ? `  \x1b[90m${d}\x1b[0m` : ""}`); };
const bad = (n: string, d: string) => { failed++; console.log(`  \x1b[31m✗\x1b[0m ${n}\n      \x1b[31m${d}\x1b[0m`); };
const show = (v: unknown) => JSON.stringify(canonical(v));

/** Sorts object keys so a comparison does not depend on their order. */
function canonical(v: unknown): unknown {
  if (typeof v === "bigint") return `${v}n`;
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => [k, canonical(x)]),
    );
  }
  return v;
}

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
      ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
async function tokenFor(email: string, actor = "ADMIN_USER"): Promise<string> {
  const r = await call("/auth/login", { method: "POST", body: { email, password: PASSWORD, actor } });
  if (r.status !== 200) throw new Error(`login failed for ${email}: ${JSON.stringify(r.body)}`);
  return r.body.tokens.accessToken;
}

const stamp = Date.now();

async function main() {
  // The suites share one address; the throttle is not aimed at them.
  await clearRateLimit();

  const admin = await tokenFor("priya@gurukulam.test");
  const regional = await tokenFor("arun@gurukulam.test");

  const blr = await prisma.city.findFirstOrThrow({ where: { cityCode: "CITY-BLR" } });
  const hyd = await prisma.city.findFirstOrThrow({ where: { cityCode: "CITY-HYD" } });
  const snc = await prisma.college.findFirstOrThrow({ where: { collegeCode: "CLG-SNC-01" } });

  // A course of our own, so the run does not depend on seed state.
  const course = await call("/courses", {
    method: "POST", token: admin,
    body: {
      name: `Delivery Probe ${stamp}`, standardMarketValue: "30000",
      topics: [{ title: "Module one" }, { title: "Module two" }],
    },
  });
  const courseId = course.body.courseId as string;
  const detail = await call(`/courses/${courseId}`, { token: admin });
  const topicIds = detail.body.topics.map((t: any) => t.topicId) as string[];

  const trainerA = await call("/trainers", {
    method: "POST", token: admin,
    body: { name: "Approved Trainer", email: `approved.${stamp}@t.test`, skillTags: [], cityId: blr.cityId },
  });
  const trainerB = await call("/trainers", {
    method: "POST", token: admin,
    body: { name: "Unapproved Trainer", email: `unapproved.${stamp}@t.test`, skillTags: [], cityId: blr.cityId },
  });
  await call(`/trainers/${trainerA.body.trainerId}/courses`, {
    method: "PUT", token: admin, body: { courseIds: [courseId] },
  });

  // ── Segments ────────────────────────────────────────────────────────────
  console.log("\n\x1b[1mA batch is retail or college, decided by one nullable column\x1b[0m");

  const retail = await call("/batches", {
    method: "POST", token: admin,
    body: {
      name: `Retail cohort ${stamp}`, courseId, cityId: blr.cityId,
      startDate: "2026-10-05", endDate: "2026-12-20", maxCapacity: 30, venue: "Room 1",
    },
  });
  expect("a retail batch is created", retail.status, 201);
  expect("…with no college", retail.body.collegeId, null);
  expect("…and its segment derived from that", retail.body.segment, "RETAIL");
  expect("…with a generated batch code", /^BTC-DP-OCT-[A-Z]+$/.test(retail.body.batchCode), true);
  const retailId = retail.body.batchId as string;

  const dedicated = await call("/batches", {
    method: "POST", token: admin,
    body: {
      name: `SNC cohort ${stamp}`, courseId, collegeId: snc.collegeId,
      startDate: "2026-10-12", venue: "SNC Hall",
    },
  });
  expect("a dedicated batch is created", dedicated.status, 201);
  expect("…carrying its college", dedicated.body.collegeId, snc.collegeId);
  expect("…and reads as COLLEGE", dedicated.body.segment, "COLLEGE");
  expect("…inheriting the college's city", dedicated.body.cityId, hyd.cityId);
  const dedicatedId = dedicated.body.batchId as string;

  const retailOnly = await call(`/batches?segment=RETAIL&pageSize=200`, { token: admin });
  const anyCollege = retailOnly.body.rows.some((b: any) => b.collegeId !== null);
  expect("filtering by segment never mixes the two", anyCollege, false);

  // ── Invariant 15 ────────────────────────────────────────────────────────
  console.log("\n\x1b[1mInvariant 15 — a batch's trainer must be approved for its course\x1b[0m");

  const unapproved = await call(`/batches/${retailId}/trainer/propose`, {
    method: "POST", token: admin, body: { trainerId: trainerB.body.trainerId },
  });
  expect("proposing an unapproved trainer is refused", unapproved.status, 422);
  expect("…as an invariant violation, not a validation slip", unapproved.body.error.code, "INVARIANT_VIOLATION");

  // ── Invariant 9 ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1mInvariant 9 — a proposal is not committed delivery\x1b[0m");

  const proposed = await call(`/batches/${retailId}/trainer/propose`, {
    method: "POST", token: admin, body: { trainerId: trainerA.body.trainerId },
  });
  expect("an approved trainer can be proposed", proposed.status, 200);
  expect("…and starts as PROPOSED", proposed.body.status, "PROPOSED");

  const afterPropose = await call(`/batches/${retailId}`, { token: admin });
  expect("the batch has NO primary trainer yet", afterPropose.body.primaryTrainerId, null);

  const second = await call(`/batches/${retailId}/trainer/propose`, {
    method: "POST", token: admin, body: { trainerId: trainerA.body.trainerId },
  });
  expect("a second open proposal is refused", second.status, 409);

  const declined = await call(`/batches/${retailId}/trainer/respond`, {
    method: "POST", token: admin, body: { decision: "DECLINE", reason: "Already committed that month" },
  });
  expect("a trainer can decline", declined.body.status, "DECLINED");
  expect("…and the reason is retained", declined.body.declineReason, "Already committed that month");

  const afterDecline = await call(`/batches/${retailId}`, { token: admin });
  expect("a decline leaves the batch unassigned", afterDecline.body.primaryTrainerId, null);

  const noReason = await call(`/batches/${retailId}/trainer/respond`, {
    method: "POST", token: admin, body: { decision: "DECLINE" },
  });
  expect("declining without a reason is refused", noReason.status, 400);

  await call(`/batches/${retailId}/trainer/propose`, {
    method: "POST", token: admin, body: { trainerId: trainerA.body.trainerId },
  });
  const confirmed = await call(`/batches/${retailId}/trainer/respond`, {
    method: "POST", token: admin, body: { decision: "CONFIRM" },
  });
  expect("confirming commits the delivery", confirmed.body.status, "CONFIRMED");
  const afterConfirm = await call(`/batches/${retailId}`, { token: admin });
  expect("…and only NOW is there a primary trainer", afterConfirm.body.primaryTrainerId, trainerA.body.trainerId);

  // ── Sessions ────────────────────────────────────────────────────────────
  console.log("\n\x1b[1mSessions hang off the batch, taught against its own topics\x1b[0m");

  const s1 = await call("/batches/sessions", {
    method: "POST", token: admin,
    body: { batchId: retailId, topicId: topicIds[0], title: "Module one", scheduledDate: "2026-10-05", startTime: "10:00", endTime: "13:00" },
  });
  expect("a session is created", s1.status, 201);
  expect("…sequenced from one", s1.body.sequence, 1);
  expect("…with a code derived from its batch", s1.body.sessionCode.startsWith("SES-DP-OCT-"), true);
  expect("…inheriting the batch's confirmed trainer", s1.body.trainerId, trainerA.body.trainerId);
  const s1Id = s1.body.sessionId as string;

  const s2 = await call("/batches/sessions", {
    method: "POST", token: admin,
    body: { batchId: retailId, topicId: topicIds[1], title: "Module two", scheduledDate: "2026-10-12", startTime: "10:00", endTime: "13:00" },
  });
  expect("the next session increments", s2.body.sequence, 2);

  const foreignTopic = await call("/batches/sessions", {
    method: "POST", token: admin,
    body: { batchId: retailId, topicId: "00000000-0000-0000-0000-000000000000", title: "Wrong", scheduledDate: "2026-10-19", startTime: "10:00", endTime: "11:00" },
  });
  expect("a topic from another course is refused", foreignTopic.status, 400);

  const backwards = await call("/batches/sessions", {
    method: "POST", token: admin,
    body: { batchId: retailId, title: "Backwards", scheduledDate: "2026-10-19", startTime: "13:00", endTime: "10:00" },
  });
  expect("a session ending before it starts is refused", backwards.status, 400);

  // ── Invariant 17 ────────────────────────────────────────────────────────
  console.log("\n\x1b[1mInvariant 17 — completion gates assignments\x1b[0m");

  const early = await call(`/batches/sessions/${s1Id}/assignments`, {
    method: "POST", token: admin, body: { title: "Too early" },
  });
  expect("an assignment before completion is refused", early.status, 422);
  expect("…naming the rule", early.body.error.message.includes("complete"), true);

  const completed = await call(`/batches/sessions/${s1Id}/complete`, { method: "POST", token: admin });
  expect("the session can be marked complete", completed.body.status, "COMPLETED");
  expect("…recording when", completed.body.completedAt !== null, true);

  const assignment = await call(`/batches/sessions/${s1Id}/assignments`, {
    method: "POST", token: admin, body: { title: "Query practice", maxMarks: 20 },
  });
  expect("now an assignment can be set", assignment.status, 201);
  expect("…with a generated code", /^ASG-\d{4}$/.test(assignment.body.assignmentCode), true);
  // Invariant 16: an assignment belongs to a BATCH; the session link is extra.
  expect("…belonging to the batch", assignment.body.batchId, retailId);
  expect("…and linked to the session", assignment.body.sessionId, s1Id);

  const doubleComplete = await call(`/batches/sessions/${s1Id}/complete`, { method: "POST", token: admin });
  expect("completing twice is refused", doubleComplete.status, 409);

  // ── Recording ───────────────────────────────────────────────────────────
  console.log("\n\x1b[1mThe recording is prompted for by completion\x1b[0m");

  const earlyRecording = await call(`/batches/sessions/${s2.body.sessionId}/recording`, {
    method: "POST", token: admin, body: { url: "https://youtu.be/abc123" },
  });
  expect("a recording before completion is refused", earlyRecording.status, 422);

  const recording = await call(`/batches/sessions/${s1Id}/recording`, {
    method: "POST", token: admin, body: { url: "https://youtu.be/abc123", provider: "YOUTUBE" },
  });
  expect("a completed session takes its recording", recording.status, 200);
  expect("…titled from the session when not given", recording.body.title, "Module one");

  const replaced = await call(`/batches/sessions/${s1Id}/recording`, {
    method: "POST", token: admin, body: { url: "https://youtu.be/replaced", provider: "YOUTUBE" },
  });
  expect("re-linking replaces rather than duplicating", replaced.body.recordingId, recording.body.recordingId);
  expect("…with the new URL", replaced.body.url, "https://youtu.be/replaced");

  // ── Reopening ───────────────────────────────────────────────────────────
  console.log("\n\x1b[1mReopening is guarded by what completion released\x1b[0m");

  await call(`/batches/assignments/${assignment.body.assignmentId}`, {
    method: "PATCH", token: admin, body: { status: "OPEN" },
  });
  const blockedReopen = await call(`/batches/sessions/${s1Id}/reopen`, { method: "POST", token: admin });
  expect("reopening with a published assignment is refused", blockedReopen.status, 409);

  await call(`/batches/assignments/${assignment.body.assignmentId}`, {
    method: "PATCH", token: admin, body: { status: "DRAFT" },
  });
  const reopened = await call(`/batches/sessions/${s1Id}/reopen`, { method: "POST", token: admin });
  expect("with the assignment back in draft it reopens", reopened.body.status, "SCHEDULED");
  expect("…and completion is cleared", reopened.body.completedAt, null);

  // ── Reschedule ──────────────────────────────────────────────────────────
  console.log("\n\x1b[1mA reschedule moves the session in place\x1b[0m");

  const beforeMove = await call(`/batches/sessions/${s2.body.sessionId}`, { token: admin });
  const moved = await call(`/batches/sessions/${s2.body.sessionId}/reschedule`, {
    method: "POST", token: admin,
    body: { scheduledDate: "2026-10-14", startTime: "14:00", endTime: "17:00", reason: "Trainer travel" },
  });
  expect("the session moves", moved.body.scheduledDate, "2026-10-14");
  // Identity preserved is the whole point — attendance and the recording stay
  // attached, which a cancel-and-recreate would orphan.
  expect("…keeping its identity", moved.body.sessionId, beforeMove.body.sessionId);
  expect("…and its code", moved.body.sessionCode, beforeMove.body.sessionCode);
  expect("…recording where it came from", moved.body.rescheduledFrom !== null, true);
  expect("…and why", moved.body.rescheduleReason, "Trainer travel");

  const noWhy = await call(`/batches/sessions/${s2.body.sessionId}/reschedule`, {
    method: "POST", token: admin,
    body: { scheduledDate: "2026-10-15", startTime: "14:00", endTime: "17:00" },
  });
  expect("rescheduling without a reason is refused", noWhy.status, 400);

  // ── Scope ───────────────────────────────────────────────────────────────
  console.log("\n\x1b[1mScope reaches sessions through their batch\x1b[0m");

  const hydSession = await call("/batches/sessions", {
    method: "POST", token: admin,
    body: { batchId: dedicatedId, title: "SNC session", scheduledDate: "2026-10-12", startTime: "09:00", endTime: "12:00" },
  });
  expect("a session is created on the Hyderabad batch", hydSession.status, 201);

  const regionalSees = await call(`/batches/sessions?pageSize=200`, { token: regional });
  const leaked = regionalSees.body.rows.some((s: any) => s.sessionId === hydSession.body.sessionId);
  expect("a Bengaluru sub-admin does not see a Hyderabad session", leaked, false);

  const regionalReach = await call(`/batches/sessions/${hydSession.body.sessionId}`, { token: regional });
  expect("…nor reach it by id", regionalReach.status, 404);

  const regionalBatch = await call(`/batches/${dedicatedId}`, { token: regional });
  expect("…nor its batch", regionalBatch.status, 404);

  // ── Deletion guards ─────────────────────────────────────────────────────
  console.log("\n\x1b[1mDelivery history is not deletable\x1b[0m");

  await call(`/batches/sessions/${s1Id}/complete`, { method: "POST", token: admin });
  const deleteCompleted = await call(`/batches/sessions/${s1Id}`, { method: "DELETE", token: admin });
  expect("a completed session cannot be deleted", deleteCompleted.status, 409);

  const removeBatch = await call(`/batches/${retailId}`, { method: "DELETE", token: admin });
  expect("an empty batch can be removed", removeBatch.status, 204);
  const sessionsAfter = await prisma.batchSession.findMany({ where: { batchId: retailId } });
  expect("…taking its sessions with it, softly", sessionsAfter.every((s) => s.deletedAt !== null), true);
  expect("…without erasing them", sessionsAfter.length > 0, true);

  console.log(`\n${failed === 0 ? "\x1b[32m" : "\x1b[31m"}${passed} passed, ${failed} failed\x1b[0m\n`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
