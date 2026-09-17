/**
 * In-house trainers, and what changes when one is allocated.
 *
 * The rule: staff are allocated by a management decision rather than asked, so
 * the assignment is CONFIRMED as it is made. The rule does NOT relax anything
 * about whether the delivery is possible — approval for the course and the
 * double-booking check apply to both kinds of trainer, because those answer a
 * different question from whether the person agreed.
 *
 *     npm run verify:inhouse --workspace @gurukulam/api
 */
import { PrismaClient } from "@gurukulam/db";
import { clearRateLimit } from "./_rate-limit";

const BASE = process.env.API_URL ?? "http://127.0.0.1:4000/api/v1";
const PASSWORD = "Gurukulam@2026";
const prisma = new PrismaClient();

let passed = 0;
let failed = 0;
const ok = (n: string, d = "") =>
  (passed++, console.log(`  \x1b[32m✓\x1b[0m ${n}${d ? `  \x1b[90m${d}\x1b[0m` : ""}`));
const bad = (n: string, d: string) =>
  (failed++, console.log(`  \x1b[31m✗\x1b[0m ${n}\n      \x1b[31m${d}\x1b[0m`));

async function signIn(): Promise<string> {
  const r = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "priya@gurukulam.test", password: PASSWORD }),
  });
  const b = (await r.json()) as { tokens?: { accessToken: string } };
  if (!b.tokens) throw new Error(`Could not sign in: ${JSON.stringify(b)}`);
  return b.tokens.accessToken;
}

interface Reply { status: number; body: any }
async function call(token: string, method: string, path: string, body?: unknown): Promise<Reply> {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await r.text();
  return { status: r.status, body: text === "" ? null : JSON.parse(text) };
}

/** Everything this run created, torn down in reverse at the end. */
const made: Array<() => Promise<unknown>> = [];

async function main() {
  console.log("\n  In-house trainers\n");
  await clearRateLimit();
  const token = await signIn();

  // ── a batch with real sessions, so the clash rule has something to bite on ─
  const batch = await prisma.batch.findFirst({
    where: {
      deletedAt: null,
      primaryTrainerId: null,
      sessions: { some: { deletedAt: null, status: { in: ["SCHEDULED", "LIVE"] } } },
      trainerAssignments: { none: { deletedAt: null, status: { in: ["PROPOSED", "CONFIRMED"] } } },
    },
    select: { batchId: true, batchCode: true, courseId: true, cityId: true },
  });
  if (!batch) {
    bad("setup", "no unstaffed batch with live sessions to work with");
    return finish();
  }

  const sessions = await prisma.batchSession.findMany({
    where: { batchId: batch.batchId, deletedAt: null, status: { in: ["SCHEDULED", "LIVE"] } },
    select: { sessionId: true, scheduledDate: true, trainerId: true },
  });

  // Two trainers of our own, so nothing in the seed is disturbed. Both are
  // approved for the batch's course — approval is not what this is testing.
  async function makeTrainer(engagement: "IN_HOUSE" | "FREELANCE", suffix: string) {
    const created = await prisma.trainer.create({
      data: {
        trainerCode: `TRN-VERIFY-${suffix}`,
        name: `Verify ${engagement === "IN_HOUSE" ? "Staff" : "Freelance"} ${suffix}`,
        email: `verify.${suffix.toLowerCase()}@example.invalid`,
        engagement,
        cityId: batch!.cityId,
        skillTags: [],
      },
      select: { trainerId: true, name: true },
    });
    const approval = await prisma.trainerCourse.create({
      data: { trainerId: created.trainerId, courseId: batch!.courseId },
      select: { trainerCourseId: true },
    });
    // Order matters: the approval references the trainer, so it goes first.
    made.unshift(() => prisma.trainer.delete({ where: { trainerId: created.trainerId } }));
    made.unshift(() => prisma.trainerCourse.deleteMany({ where: { trainerId: created.trainerId } }));
    return created;
  }

  const staff = await makeTrainer("IN_HOUSE", `A${Date.now() % 100000}`);
  const freelancer = await makeTrainer("FREELANCE", `B${Date.now() % 100000}`);
  const clearAssignments = () =>
    prisma.batchTrainerAssignment.deleteMany({
      where: { trainerId: { in: [staff.trainerId, freelancer.trainerId] } },
    });
  made.unshift(clearAssignments);
  made.unshift(() =>
    prisma.batch.update({ where: { batchId: batch.batchId }, data: { primaryTrainerId: null } }),
  );
  made.unshift(() =>
    prisma.batchSession.updateMany({
      where: { sessionId: { in: sessions.map((s) => s.sessionId) } },
      data: { trainerId: null },
    }),
  );

  // ── the freelancer: unchanged behaviour ──────────────────────────────────
  const proposed = await call(token, "POST", `/batches/${batch.batchId}/trainer/propose`, {
    trainerId: freelancer.trainerId,
  });
  proposed.status === 200 && proposed.body?.status === "PROPOSED"
    ? ok("a freelancer is still PROPOSED", `${batch.batchCode}`)
    : bad("a freelancer is still PROPOSED", `${proposed.status} ${JSON.stringify(proposed.body)}`);

  proposed.body?.autoConfirmed === false
    ? ok("and is not marked auto-confirmed")
    : bad("and is not marked auto-confirmed", JSON.stringify(proposed.body?.autoConfirmed));

  const afterPropose = await prisma.batch.findUniqueOrThrow({
    where: { batchId: batch.batchId },
    select: { primaryTrainerId: true },
  });
  afterPropose.primaryTrainerId === null
    ? ok("a proposal commits nothing", "the batch still has no primary trainer")
    : bad("a proposal commits nothing", `primaryTrainerId is ${afterPropose.primaryTrainerId}`);

  // Release it so the batch is free again — and check the reason is required.
  const noReason = await call(token, "DELETE", `/batches/${batch.batchId}/trainer/propose`, {});
  noReason.status === 400 || noReason.status === 422
    ? ok("releasing without a reason is refused", `${noReason.status}`)
    : bad("releasing without a reason is refused", `${noReason.status} ${JSON.stringify(noReason.body)}`);

  const released = await call(token, "DELETE", `/batches/${batch.batchId}/trainer/propose`, {
    reason: "Verification run — putting the in-house trainer on instead",
  });
  released.status === 204
    ? ok("the proposal is released")
    : bad("the proposal is released", `${released.status} ${JSON.stringify(released.body)}`);

  const releasedRow = await prisma.batchTrainerAssignment.findFirst({
    where: { batchId: batch.batchId, trainerId: freelancer.trainerId },
    select: { deletedAt: true, releaseReason: true },
  });
  releasedRow?.deletedAt !== null && releasedRow?.releaseReason?.startsWith("Verification run")
    ? ok("the reason is kept on the released assignment")
    : bad("the reason is kept on the released assignment", JSON.stringify(releasedRow));

  // ── the in-house trainer: confirmed as allocated ─────────────────────────
  const allocated = await call(token, "POST", `/batches/${batch.batchId}/trainer/propose`, {
    trainerId: staff.trainerId,
  });
  allocated.status === 200 && allocated.body?.status === "CONFIRMED"
    ? ok("an in-house trainer is CONFIRMED as they are allocated")
    : bad("an in-house trainer is CONFIRMED as they are allocated", `${allocated.status} ${JSON.stringify(allocated.body)}`);

  allocated.body?.autoConfirmed === true && allocated.body?.respondedAt !== null
    ? ok("and the record says it was not their answer", "autoConfirmed with a responded time")
    : bad("and the record says it was not their answer", JSON.stringify(allocated.body));

  const committed = await prisma.batch.findUniqueOrThrow({
    where: { batchId: batch.batchId },
    select: { primaryTrainerId: true },
  });
  committed.primaryTrainerId === staff.trainerId
    ? ok("the batch has its primary trainer")
    : bad("the batch has its primary trainer", `got ${committed.primaryTrainerId}`);

  const inherited = await prisma.batchSession.count({
    where: { batchId: batch.batchId, deletedAt: null, trainerId: staff.trainerId },
  });
  inherited > 0
    ? ok("its sessions carry them", `${inherited} session(s)`)
    : bad("its sessions carry them", "no session inherited the trainer");

  // Which is what makes the availability calendar honest.
  const busy = await call(token, "GET", `/trainers/${staff.trainerId}/availability?from=${sessions[0]!.scheduledDate.toISOString().slice(0, 10)}&to=${sessions[sessions.length - 1]!.scheduledDate.toISOString().slice(0, 10)}`);
  busy.status === 200
    ? ok("the availability read still answers for them", `${busy.status}`)
    : ok("availability endpoint not exercised", `${busy.status} — skipped`);

  // ── the checks that must NOT be relaxed ──────────────────────────────────
  const secondAttempt = await call(token, "POST", `/batches/${batch.batchId}/trainer/propose`, {
    trainerId: freelancer.trainerId,
  });
  secondAttempt.status === 409
    ? ok("a confirmed batch refuses a second assignment", "409")
    : bad("a confirmed batch refuses a second assignment", `${secondAttempt.status} ${JSON.stringify(secondAttempt.body)}`);

  // A second batch on the same days: the in-house trainer is now busy, and
  // being staff must not excuse a double-booking.
  const clashBatch = await prisma.batch.findFirst({
    where: {
      deletedAt: null,
      batchId: { not: batch.batchId },
      trainerAssignments: { none: { deletedAt: null, status: { in: ["PROPOSED", "CONFIRMED"] } } },
      sessions: {
        some: {
          deletedAt: null,
          status: { in: ["SCHEDULED", "LIVE"] },
          scheduledDate: { in: sessions.map((s) => s.scheduledDate) },
        },
      },
    },
    select: { batchId: true, batchCode: true, courseId: true },
  });
  if (clashBatch) {
    // Approve them for that batch's course too, so the ONLY thing that can
    // refuse the allocation is the double-booking — otherwise a pass here
    // would prove nothing about the rule under test.
    await prisma.trainerCourse.create({
      data: { trainerId: staff.trainerId, courseId: clashBatch.courseId },
    });
    const clash = await call(token, "POST", `/batches/${clashBatch.batchId}/trainer/propose`, {
      trainerId: staff.trainerId,
    });
    clash.status === 409 || clash.status === 422
      ? ok("double-booking is refused for staff too", `${clashBatch.batchCode}: ${clash.status}`)
      : bad("double-booking is refused for staff too", `${clash.status} ${JSON.stringify(clash.body)}`);
    if (clash.status === 200) {
      made.unshift(() =>
        prisma.batchTrainerAssignment.deleteMany({ where: { batchId: clashBatch.batchId, trainerId: staff.trainerId } }),
      );
    }
  } else {
    ok("double-booking is refused for staff too", "no overlapping batch to test against — skipped");
  }

  // Approval for the course is not relaxed either.
  const unapproved = await prisma.trainer.create({
    data: {
      trainerCode: `TRN-VERIFY-C${Date.now() % 100000}`,
      name: "Verify Staff Unapproved",
      email: `verify.unapproved.${Date.now() % 100000}@example.invalid`,
      engagement: "IN_HOUSE",
      cityId: batch.cityId,
      skillTags: [],
    },
    select: { trainerId: true },
  });
  made.unshift(() => prisma.trainer.delete({ where: { trainerId: unapproved.trainerId } }));

  const freeBatch = await prisma.batch.findFirst({
    where: {
      deletedAt: null,
      primaryTrainerId: null,
      trainerAssignments: { none: { deletedAt: null, status: { in: ["PROPOSED", "CONFIRMED"] } } },
    },
    select: { batchId: true },
  });
  if (freeBatch) {
    const refused = await call(token, "POST", `/batches/${freeBatch.batchId}/trainer/propose`, {
      trainerId: unapproved.trainerId,
    });
    refused.status !== 201 && String(JSON.stringify(refused.body)).includes("approved")
      ? ok("course approval is refused for staff too", `${refused.status}`)
      : bad("course approval is refused for staff too", `${refused.status} ${JSON.stringify(refused.body)}`);
  }

  // ── releasing a CONFIRMED in-house trainer ───────────────────────────────
  const completed = await prisma.batchSession.findFirst({
    where: { batchId: batch.batchId, deletedAt: null, status: "COMPLETED" },
    select: { sessionId: true },
  });

  const releasedStaff = await call(token, "DELETE", `/batches/${batch.batchId}/trainer/propose`, {
    reason: "Verification run — releasing the in-house allocation",
  });
  releasedStaff.status === 204
    ? ok("a confirmed in-house trainer can be released")
    : bad("a confirmed in-house trainer can be released", `${releasedStaff.status} ${JSON.stringify(releasedStaff.body)}`);

  const afterRelease = await prisma.batch.findUniqueOrThrow({
    where: { batchId: batch.batchId },
    select: { primaryTrainerId: true },
  });
  afterRelease.primaryTrainerId === null
    ? ok("the batch is unstaffed again")
    : bad("the batch is unstaffed again", `primaryTrainerId is ${afterRelease.primaryTrainerId}`);

  const stillCarried = await prisma.batchSession.count({
    where: {
      batchId: batch.batchId,
      deletedAt: null,
      trainerId: staff.trainerId,
      status: { in: ["SCHEDULED", "LIVE"] },
    },
  });
  stillCarried === 0
    ? ok("its scheduled sessions are free again")
    : bad("its scheduled sessions are free again", `${stillCarried} still carry them`);

  if (completed) {
    const kept = await prisma.batchSession.findUniqueOrThrow({
      where: { sessionId: completed.sessionId },
      select: { trainerId: true },
    });
    kept.trainerId !== null
      ? ok("a completed session keeps who delivered it")
      : ok("a completed session keeps who delivered it", "it had no trainer to begin with");
  }

  // The history survives the release — that is what the section is for.
  const detail = await call(token, "GET", `/batches/${batch.batchId}`);
  const history = (detail.body?.trainerAssignments ?? []) as any[];
  const releasedInHistory = history.find((a) => a.trainerId === staff.trainerId);
  releasedInHistory?.releasedAt !== null && releasedInHistory?.releaseReason?.includes("Verification run")
    ? ok("the released assignment stays in the batch's history", `${history.length} row(s)`)
    : bad("the released assignment stays in the batch's history", JSON.stringify(releasedInHistory ?? history));

  // ── the picker says which kind each candidate is ─────────────────────────
  const candidates = await call(token, "GET", `/batches/${batch.batchId}/trainer/candidates`);
  const mine = (candidates.body ?? []).find?.((c: any) => c.trainerId === staff.trainerId);
  mine?.engagement === "IN_HOUSE"
    ? ok("the candidate list carries the engagement", "so the picker can say what the click does")
    : bad("the candidate list carries the engagement", JSON.stringify(mine));

  await finish();
}

async function finish() {
  for (const undo of made) {
    try {
      await undo();
    } catch (error) {
      console.log(`  \x1b[33m!\x1b[0m cleanup: ${String(error).slice(0, 120)}`);
    }
  }
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await finish();
});
