/**
 * M12 — certificates, the submission flow and the access asymmetry.
 *
 * Two rules carry this module, and both are the kind that look fine in a demo
 * while being wrong:
 *
 *   · Invariant 18 — an uploaded name is not a certificate. Only an APPROVED
 *     row, on a RELEASED submission, becomes one.
 *   · Invariant 7 — eligibility is identical across segments; ACCESS is not.
 *     A retail student fetches their own; a college student cannot fetch
 *     theirs at all.
 *
 *     pnpm --filter @gurukulam/api verify:certificates
 */
import { PrismaClient } from "@gurukulam/db";

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
  const a = show(actual), w = show(wanted);
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
async function tokenFor(email: string, actor = "ADMIN_USER", password = PASSWORD): Promise<string> {
  const r = await call("/auth/login", { method: "POST", body: { email, password, actor } });
  if (r.status !== 200) throw new Error(`login failed for ${email}: ${show(r.body)}`);
  return r.body.tokens.accessToken;
}

const stamp = Date.now();

async function main() {
  const admin = await tokenFor("priya@gurukulam.test");
  const collegeUser = await tokenFor("tpo@snc.example.test", "COLLEGE_USER");

  const blr = await prisma.city.findFirstOrThrow({ where: { cityCode: "CITY-BLR" } });
  const snc = await prisma.college.findFirstOrThrow({ where: { collegeCode: "CLG-SNC-01" } });

  // Fixtures: one retail batch and one dedicated to SNC, each with a completed
  // session so eligibility has something to evaluate.
  const course = await call("/courses", {
    method: "POST", token: admin,
    body: { name: `Cert Probe ${stamp}`, standardMarketValue: "30000", attendanceFloorPct: 75, topics: [{ title: "One" }] },
  });
  const courseId = course.body.courseId as string;

  const retailBatch = await call("/batches", {
    method: "POST", token: admin,
    body: { name: `Retail cert ${stamp}`, courseId, cityId: blr.cityId, startDate: "2026-11-02" },
  });
  const collegeBatch = await call("/batches", {
    method: "POST", token: admin,
    body: { name: `SNC cert ${stamp}`, courseId, collegeId: snc.collegeId, startDate: "2026-11-03" },
  });

  const mkSession = async (batchId: string, title: string, date: string) => {
    const s = await call("/batches/sessions", {
      method: "POST", token: admin,
      body: { batchId, title, scheduledDate: date, startTime: "10:00", endTime: "13:00" },
    });
    await call(`/batches/sessions/${s.body.sessionId}/complete`, { method: "POST", token: admin });
    return s.body.sessionId as string;
  };
  await mkSession(retailBatch.body.batchId, "Retail session", "2026-11-02");
  await mkSession(collegeBatch.body.batchId, "College session", "2026-11-03");

  const retailStudent = await call("/students", {
    method: "POST", token: admin,
    body: { firstName: "Nisha", lastName: "Patel", email: `nisha.${stamp}@example.test`, cityId: blr.cityId },
  });
  await call(`/students/${retailStudent.body.studentId}/allocate`, {
    method: "POST", token: admin,
    body: { batchId: retailBatch.body.batchId, enrolmentValue: "30000", installments: [{ amount: "30000", dueDate: "2026-12-01" }] },
  });

  const collegeStudent = await call("/students", {
    method: "POST", token: collegeUser,
    body: { firstName: "Karthik", lastName: "Menon", email: `karthik.${stamp}@snc.example.test` },
  });
  await call(`/students/${collegeStudent.body.studentId}/allocate`, {
    method: "POST", token: admin, body: { batchId: collegeBatch.body.batchId },
  });

  // ── Eligibility ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1mEligibility is reported, never auto-issued\x1b[0m");

  const eligible = await call(
    `/certificates/eligibility?studentId=${retailStudent.body.studentId}&batchId=${retailBatch.body.batchId}`,
    { token: admin },
  );
  expect("eligibility is evaluated", eligible.status, 200);
  expect("…the student is on the roster", eligible.body.onRoster, true);
  expect("…a completed session exists", eligible.body.sessionsCompleted, 1);
  // Attendance is deferred, so no rows exist. Reporting 0% would block every
  // certificate in the system; NOT_EVALUATED says so honestly.
  expect("…attendance is not evaluated rather than reported as zero", eligible.body.attendanceCheck, "NOT_EVALUATED");
  expect("…and the floor is still surfaced", eligible.body.attendanceFloorPct, 75);
  expect("…so the operator may sign off", eligible.body.eligible, true);

  const strangerBatch = await call(
    `/certificates/eligibility?studentId=${retailStudent.body.studentId}&batchId=${collegeBatch.body.batchId}`,
    { token: admin },
  );
  expect("a student not on the roster is not eligible", strangerBatch.body.eligible, false);
  expect("…and the blocker says why", strangerBatch.body.blockers[0].includes("roster"), true);

  // ── Direct issue ────────────────────────────────────────────────────────
  console.log("\n\x1b[1mThe retail path issues directly\x1b[0m");

  const notEligible = await call("/certificates", {
    method: "POST", token: admin,
    body: { studentId: retailStudent.body.studentId, batchId: collegeBatch.body.batchId },
  });
  expect("issuing to an ineligible student is refused", notEligible.status, 422);

  const issued = await call("/certificates", {
    method: "POST", token: admin,
    body: { studentId: retailStudent.body.studentId, batchId: retailBatch.body.batchId },
  });
  expect("a certificate is issued", issued.status, 201);
  expect("…with a generated number", /^GK-CERT-\d{4}-\d{5}$/.test(issued.body.certificateNumber), true);
  expect("…as ISSUED", issued.body.status, "ISSUED");
  expect("…for a retail student", issued.body.segment, "RETAIL");
  // Direct issue is not a submission, so there is no row behind it.
  expect("…with no submission row behind it", issued.body.submissionRowId, null);
  const retailCertId = issued.body.certificateId as string;
  const retailVerifyCode = issued.body.verificationCode as string;

  expect("the verification code is not the number", retailVerifyCode === issued.body.certificateNumber, false);
  expect("…and is long enough not to be guessed", retailVerifyCode.length >= 20, true);

  const twice = await call("/certificates", {
    method: "POST", token: admin,
    body: { studentId: retailStudent.body.studentId, batchId: retailBatch.body.batchId },
  });
  expect("the same student cannot be certified twice for a batch", twice.status, 409);

  // ── Invariant 18 ────────────────────────────────────────────────────────
  console.log("\n\x1b[1mInvariant 18 — an uploaded name is not a certificate\x1b[0m");

  const submission = await call("/certificates/submissions", {
    method: "POST", token: collegeUser,
    body: {
      batchId: collegeBatch.body.batchId,
      names: [
        { name: "Karthik Menon", email: `karthik.${stamp}@snc.example.test` },
        { name: "Someone Who Never Enrolled", ref: "SNC/9999" },
      ],
    },
  });
  expect("a college uploads its list", submission.status, 201);
  expect("…as SUBMITTED", submission.body.status, "SUBMITTED");
  expect("…with both names pending", submission.body.pendingCount, 2);

  const certsSoFar = await prisma.certificate.count({ where: { batchId: collegeBatch.body.batchId } });
  // The whole rule, asserted: uploading created nothing.
  expect("uploading names created no certificates", certsSoFar, 0);

  const wrongBatch = await call("/certificates/submissions", {
    method: "POST", token: collegeUser,
    body: { batchId: retailBatch.body.batchId, names: [{ name: "Not ours" }] },
  });
  expect("a college cannot submit against a retail batch", wrongBatch.status, 400);

  const review = await call(`/certificates/submissions/${submission.body.submissionId}`, { token: admin });
  expect("the review table opens", review.status, 200);
  expect("…keeping the uploaded name verbatim", review.body.rows[0].uploadedName.length > 0, true);
  expect("…unmatched until an admin matches it", review.body.rows[0].studentId, null);

  const rows = review.body.rows as any[];
  const karthikRow = rows.find((r) => r.uploadedName === "Karthik Menon");
  const phantomRow = rows.find((r) => r.uploadedName.startsWith("Someone"));

  const collegeApproves = await call(`/certificates/submissions/rows/${karthikRow.rowId}/decide`, {
    method: "POST", token: collegeUser,
    body: { decision: "APPROVE", studentId: collegeStudent.body.studentId },
  });
  // A college approving its own list would make the review meaningless.
  expect("a college cannot approve its own submission", collegeApproves.status, 403);

  const approveNoMatch = await call(`/certificates/submissions/rows/${karthikRow.rowId}/decide`, {
    method: "POST", token: admin, body: { decision: "APPROVE" },
  });
  expect("approving without matching a student is refused", approveNoMatch.status, 400);

  const wrongStudent = await call(`/certificates/submissions/rows/${karthikRow.rowId}/decide`, {
    method: "POST", token: admin,
    body: { decision: "APPROVE", studentId: retailStudent.body.studentId },
  });
  // Approving a name onto another college's student is the worst thing this
  // screen could do.
  expect("matching to another college's student is refused", wrongStudent.status, 400);

  const approved = await call(`/certificates/submissions/rows/${karthikRow.rowId}/decide`, {
    method: "POST", token: admin,
    body: { decision: "APPROVE", studentId: collegeStudent.body.studentId },
  });
  expect("a matched, eligible row is approved", approved.body.status, "APPROVED");

  const stillNoCerts = await prisma.certificate.count({ where: { batchId: collegeBatch.body.batchId } });
  expect("approving still creates no certificate", stillNoCerts, 0);

  const releaseEarly = await call(`/certificates/submissions/${submission.body.submissionId}/release`, {
    method: "POST", token: admin,
  });
  expect("releasing with undecided names is refused", releaseEarly.status, 409);

  const rejectNoReason = await call(`/certificates/submissions/rows/${phantomRow.rowId}/decide`, {
    method: "POST", token: admin, body: { decision: "REJECT" },
  });
  expect("rejecting without a reason is refused", rejectNoReason.status, 400);

  const rejected = await call(`/certificates/submissions/rows/${phantomRow.rowId}/decide`, {
    method: "POST", token: admin,
    body: { decision: "REJECT", reason: "No matching student on this training" },
  });
  expect("the phantom name is rejected", rejected.body.status, "REJECTED");
  expect("…with the reason kept for the college", rejected.body.rejectionReason, "No matching student on this training");

  const released = await call(`/certificates/submissions/${submission.body.submissionId}/release`, {
    method: "POST", token: admin,
  });
  expect("the submission releases", released.status, 200);
  // ONE certificate — the approved row. Not two.
  expect("…minting exactly the approved rows", released.body.released, 1);

  const finalCerts = await prisma.certificate.findMany({ where: { batchId: collegeBatch.body.batchId } });
  expect("the rejected name produced nothing", finalCerts.length, 1);
  expect("…and the certificate names the row that produced it", finalCerts[0]?.submissionRowId, karthikRow.rowId);

  const releaseTwice = await call(`/certificates/submissions/${submission.body.submissionId}/release`, {
    method: "POST", token: admin,
  });
  expect("releasing twice is refused", releaseTwice.status, 409);

  const collegeCertId = finalCerts[0]!.certificateId;

  // ── Invariant 7 ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1mInvariant 7 — same eligibility, different access\x1b[0m");

  const adminDownload = await call(`/certificates/${retailCertId}/download`, { token: admin });
  expect("an admin can fetch any certificate in scope", adminDownload.status, 200);

  // Sign in as the students themselves. Allocation issued credentials with a
  // random secret, so set a known one to exercise the student path.
  const knownHash = (await prisma.student.findFirstOrThrow({
    where: { email: "meera.nair@example.test" },
    select: { passwordHash: true },
  })).passwordHash;
  await prisma.student.updateMany({
    where: { studentId: { in: [retailStudent.body.studentId, collegeStudent.body.studentId] } },
    data: { passwordHash: knownHash, mustReset: false },
  });

  const retailToken = await tokenFor(`nisha.${stamp}@example.test`, "STUDENT");
  const collegeStudentToken = await tokenFor(`karthik.${stamp}@snc.example.test`, "STUDENT");

  // Students hold no module permissions while their portal is deferred, so
  // the gate answers first — which is itself the correct behaviour today.
  const retailSelf = await call(`/certificates/${retailCertId}/download`, { token: retailToken });
  expect("a student's own fetch is gated by the deferred portal", retailSelf.status, 403);

  // The STUDENT half of invariant 7 cannot be exercised over HTTP while that
  // portal is deferred, so the rule itself is unit-tested as a pure function
  // in test/certificate-access.test.ts. What IS assertable here is the data it
  // reads and the college half of the rule.

  const retailCert = await prisma.certificate.findFirstOrThrow({
    where: { certificateId: retailCertId }, include: { student: true },
  });
  const collegeCert = await prisma.certificate.findFirstOrThrow({
    where: { certificateId: collegeCertId }, include: { student: true },
  });
  expect("the retail certificate belongs to a retail student", retailCert.student.enrolmentChannel, "RETAIL");
  expect("…and the college one to a college student", collegeCert.student.enrolmentChannel, "COLLEGE");

  const collegeSeesOwn = await call(`/certificates/${collegeCertId}`, { token: collegeUser });
  expect("a college can fetch its own student's certificate", collegeSeesOwn.status, 200);

  const collegeSeesRetail = await call(`/certificates/${retailCertId}`, { token: collegeUser });
  // A retail student has no college; nobody downloads for them.
  expect("a college cannot reach a retail student's certificate", collegeSeesRetail.status, 404);

  void collegeStudentToken;

  // ── Verification and revocation ─────────────────────────────────────────
  console.log("\n\x1b[1mThe public verifier reads the row, so revocation is immediate\x1b[0m");

  const verified = await call(`/certificates/verify/${retailVerifyCode}`);
  expect("the verifier needs no authentication", verified.status, 200);
  expect("…and reports it valid", verified.body.valid, true);
  expect("…naming the holder", verified.body.studentName, "Nisha Patel");

  const unknown = await call("/certificates/verify/definitely-not-a-code");
  expect("an unknown code is not valid", unknown.body.valid, false);
  expect("…and reveals nothing", unknown.body.studentName, null);

  const revoked = await call(`/certificates/${retailCertId}/revoke`, {
    method: "POST", token: admin, body: { reason: "Issued against the wrong batch" },
  });
  expect("a certificate can be revoked", revoked.body.status, "REVOKED");

  const afterRevoke = await call(`/certificates/verify/${retailVerifyCode}`);
  // No cache to expire — the verifier reads the row.
  expect("the verifier reflects it immediately", afterRevoke.body.valid, false);
  expect("…and says it was revoked", afterRevoke.body.status, "REVOKED");

  const downloadRevoked = await call(`/certificates/${retailCertId}/download`, { token: admin });
  expect("a revoked certificate cannot be downloaded", downloadRevoked.status, 409);

  const revokeTwice = await call(`/certificates/${retailCertId}/revoke`, {
    method: "POST", token: admin, body: { reason: "again" },
  });
  expect("revoking twice is refused", revokeTwice.status, 409);

  console.log(`\n${failed === 0 ? "\x1b[32m" : "\x1b[31m"}${passed} passed, ${failed} failed\x1b[0m\n`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
