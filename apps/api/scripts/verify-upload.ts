/**
 * A bulk upload ADDS to a batch's schedule. It never replaces it.
 *
 * That sentence is the whole feature, and it is exactly the sentence that is
 * easy to believe and wrong. So this drives the real endpoint against a real
 * batch and counts the batch's sessions in the DATABASE before and after each
 * step — not in the response, which is the thing under test.
 *
 * The scenarios, in the order an operator meets them:
 *
 *   1. a dry run writes nothing at all
 *   2. a first upload adds, and the count goes up by exactly that many
 *   3. THE SAME FILE AGAIN adds nothing — the slot is the identity
 *   4. a second, different file adds to the first rather than replacing it
 *   5. a row naming a session updates it in place
 *   6. a row that moves a session's date is refused — that is a reschedule
 *   7. a delivered session is refused — only its recording can change
 *   8. one bad row fails the whole file, and nothing at all is written
 *
 *     npm run verify:upload --workspace @gurukulam/api
 */
import { PrismaClient } from "@gurukulam/db";
import { parseSessionUpload, type SessionUploadResult } from "@gurukulam/contracts";
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
  const response = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "priya@gurukulam.test", password: PASSWORD }),
  });
  const body = (await response.json()) as { tokens?: { accessToken: string } };
  if (!body.tokens) throw new Error(`Could not sign in: ${JSON.stringify(body)}`);
  return body.tokens.accessToken;
}

/** The file, as an operator would paste it, through the real parser. */
async function upload(
  token: string, batchId: string, csv: string, dryRun: boolean,
): Promise<SessionUploadResult & { code?: string; message?: string }> {
  const parsed = parseSessionUpload(csv);
  if (!parsed.ok) throw new Error(`the test file itself does not parse: ${parsed.error}`);
  const response = await fetch(`${BASE}/batches/sessions/upload/${batchId}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ dryRun, rows: parsed.rows }),
  });
  return response.json() as Promise<SessionUploadResult & { code?: string; message?: string }>;
}

const liveCount = (batchId: string) =>
  prisma.batchSession.count({ where: { batchId, deletedAt: null } });

const header = "session_code,date,start_time,end_time,title,topic,trainer_code,mode,venue,meeting_link";
const row = (date: string, start: string, end: string, title: string, code = "") =>
  `${code},${date},${start},${end},${title},,,,,`;

async function main() {
  await clearRateLimit();
  const token = await signIn();

  // A batch with a course and a primary trainer, so inherited defaults are
  // exercised rather than skipped. Its own sessions are left alone — the
  // uploads below use a year nothing is seeded into.
  const batch = await prisma.batch.findFirstOrThrow({
    where: { deletedAt: null, primaryTrainerId: { not: null } },
    select: { batchId: true, batchCode: true },
  });
  const created: string[] = [];

  try {
    const before = await liveCount(batch.batchId);

    // ── 1. A dry run writes nothing ────────────────────────────────────────
    const fileOne = [header, row("2031-03-02", "09:30", "11:00", "Upload one"),
                             row("2031-03-03", "09:30", "11:00", "Upload two")].join("\n");
    const dry = await upload(token, batch.batchId, fileOne, true);
    const afterDry = await liveCount(batch.batchId);
    dry.committed === false && dry.added === 2 && afterDry === before
      ? ok("a dry run plans without writing", `plans +2, batch still holds ${afterDry}`)
      : bad("a dry run plans without writing",
            `committed=${dry.committed} added=${dry.added} count ${before}→${afterDry}`);

    // ── 2. The first upload adds ───────────────────────────────────────────
    const first = await upload(token, batch.batchId, fileOne, false);
    created.push(...first.lines.map((l) => l.sessionId).filter((id): id is string => Boolean(id)));
    const afterFirst = await liveCount(batch.batchId);
    first.committed && afterFirst === before + 2
      ? ok("the first upload adds", `${before} → ${afterFirst}`)
      : bad("the first upload adds", `committed=${first.committed} count ${before}→${afterFirst}`);

    const codes = first.lines.map((l) => l.sessionCode).filter(Boolean);
    codes.length === 2 && codes.every((c) => c?.startsWith("SES-"))
      ? ok("codes are generated on save", codes.join(", "))
      : bad("codes are generated on save", `got ${JSON.stringify(codes)}`);

    // ── 3. The same file again does nothing ────────────────────────────────
    const again = await upload(token, batch.batchId, fileOne, false);
    const afterAgain = await liveCount(batch.batchId);
    again.added === 0 && again.unchanged === 2 && afterAgain === afterFirst
      ? ok("the same file twice does not double the fortnight",
           `added ${again.added}, unchanged ${again.unchanged}, count still ${afterAgain}`)
      : bad("the same file twice does not double the fortnight",
            `added=${again.added} unchanged=${again.unchanged} count ${afterFirst}→${afterAgain}`);

    // ── 4. A second file ADDS to the first ─────────────────────────────────
    const fileTwo = [header, row("2031-03-09", "09:30", "11:00", "Upload three")].join("\n");
    const second = await upload(token, batch.batchId, fileTwo, false);
    created.push(...second.lines.map((l) => l.sessionId).filter((id): id is string => Boolean(id)));
    const afterSecond = await liveCount(batch.batchId);
    afterSecond === afterFirst + 1
      ? ok("a later upload adds to what is there", `${afterFirst} → ${afterSecond}`)
      : bad("a later upload adds to what is there",
            `count ${afterFirst}→${afterSecond} — a REPLACE would read ${before + 1}`);

    // ── 5. Naming a session updates it in place ────────────────────────────
    const target = first.lines.find((l) => l.outcome === "ADD");
    const renamed = [header,
      row("2031-03-02", "09:30", "12:00", "Upload one renamed", target?.sessionCode ?? ""),
    ].join("\n");
    const update = await upload(token, batch.batchId, renamed, false);
    const stored = await prisma.batchSession.findUniqueOrThrow({
      where: { sessionId: target?.sessionId ?? "" },
      select: { title: true, endTime: true },
    });
    const afterUpdate = await liveCount(batch.batchId);
    update.updated === 1 && stored.title === "Upload one renamed"
      && stored.endTime.toISOString().slice(11, 16) === "12:00" && afterUpdate === afterSecond
      ? ok("a named row updates in place", `${target?.sessionCode} → "${stored.title}", count unchanged`)
      : bad("a named row updates in place",
            `updated=${update.updated} title="${stored.title}" count ${afterSecond}→${afterUpdate}`);

    // ── 6. Moving a session is a reschedule, and is refused ────────────────
    const moved = [header,
      row("2031-04-02", "09:30", "11:00", "Upload one renamed", target?.sessionCode ?? ""),
    ].join("\n");
    const move = await upload(token, batch.batchId, moved, false);
    const moveLine = move.lines[0];
    move.rejected === 1 && /reschedul/i.test(moveLine?.detail ?? "")
      ? ok("an upload cannot move a session", moveLine?.detail?.slice(0, 64) ?? "")
      : bad("an upload cannot move a session", JSON.stringify(move.lines));

    // ── 7. A delivered session is refused ──────────────────────────────────
    await prisma.batchSession.update({
      where: { sessionId: target?.sessionId ?? "" },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    const done = await upload(token, batch.batchId, renamed, false);
    const doneLine = done.lines[0];
    done.rejected === 1 && /delivered|recording/i.test(doneLine?.detail ?? "")
      ? ok("a delivered session is not editable from a file", doneLine?.detail?.slice(0, 64) ?? "")
      : bad("a delivered session is not editable from a file", JSON.stringify(done.lines));
    await prisma.batchSession.update({
      where: { sessionId: target?.sessionId ?? "" },
      data: { status: "SCHEDULED", completedAt: null },
    });

    // ── 8. One bad row fails the whole file ────────────────────────────────
    const mixed = [header,
      row("2031-05-01", "09:30", "11:00", "Would be fine"),
      row("2031-05-02", "09:30", "11:00", "Names a stranger", "SES-NOPE-99"),
    ].join("\n");
    const countBeforeMixed = await liveCount(batch.batchId);
    const mixedResult = await upload(token, batch.batchId, mixed, false);
    const countAfterMixed = await liveCount(batch.batchId);
    mixedResult.committed === false && mixedResult.rejected === 1
      && countAfterMixed === countBeforeMixed
      ? ok("one bad row fails the whole file", "nothing written, including the good row")
      : bad("one bad row fails the whole file",
            `committed=${mixedResult.committed} count ${countBeforeMixed}→${countAfterMixed}`);

    // ── the closing claim ──────────────────────────────────────────────────
    const finalCount = await liveCount(batch.batchId);
    finalCount >= before
      ? ok("no upload ever reduced the batch's schedule", `${before} at the start, ${finalCount} now`)
      : bad("no upload ever reduced the batch's schedule", `${before} → ${finalCount}`);
  } finally {
    // Hard delete, not soft: these rows were never real delivery.
    if (created.length > 0) {
      await prisma.batchSession.deleteMany({ where: { sessionId: { in: created } } });
    }
    await prisma.$disconnect();
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
