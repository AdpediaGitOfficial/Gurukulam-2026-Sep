import type { Principal } from "@gurukulam/contracts";
import { ApiException } from "../errors";

/**
 * Scope, expressed as Prisma `where` fragments.
 *
 * Invariant 11: every scope is applied INSIDE the service, never by the
 * caller. These helpers exist so that applying it is shorter than forgetting
 * it — a service spreads one of these into its `where` and is correct, and a
 * reviewer can grep for the absence.
 *
 * The rule that is easy to get backwards: for a scoped principal, a row whose
 * city is NULL is NOT visible. `{ cityId: { in: [...] } }` excludes nulls in
 * SQL, which is the behaviour we want — a regional operator should not see
 * records that could belong to any region.
 */

/** True when this principal sees everything, on both axes. */
export const isGlobal = (principal: Principal): boolean =>
  principal.cityScope === null && principal.collegeScope === null;

/**
 * Restricts a query by the principal's city scope.
 *
 *     where: { ...live, ...cityScope(principal) }
 *
 * `field` names the column when it is not `cityId` — a batch scopes on its
 * own city, a student on theirs.
 */
export function cityScope(principal: Principal, field = "cityId"): Record<string, unknown> {
  if (principal.cityScope === null) return {};
  // An empty scope array means "scoped to nothing", and must match nothing
  // rather than everything. `{ in: [] }` is the correct SQL for that.
  return { [field]: { in: principal.cityScope } };
}

/** Restricts a query by the principal's college scope. */
export function collegeScope(principal: Principal, field = "collegeId"): Record<string, unknown> {
  if (principal.collegeScope === null) return {};
  return { [field]: principal.collegeScope };
}

/** Both axes at once, for the common case. */
export function scopeWhere(
  principal: Principal,
  fields: { city?: string | null; college?: string | null } = {},
): Record<string, unknown> {
  const { city = "cityId", college = "collegeId" } = fields;
  return {
    ...(city ? cityScope(principal, city) : {}),
    ...(college ? collegeScope(principal, college) : {}),
  };
}

/**
 * Guards a WRITE against scope.
 *
 * Reads are filtered by the fragments above, so an out-of-scope row simply
 * does not appear. A write is different: the caller already has the id, so the
 * service must check the row it fetched before touching it.
 *
 * Throws the 404 rather than a 403, because a 403 confirms that a record
 * exists in another region — which is itself the leak.
 */
export function assertInScope(
  principal: Principal,
  row: { cityId?: string | null; collegeId?: string | null },
): void {
  if (!inScope(principal, row)) throw ApiException.outOfScope();
}

/**
 * The same test, answered rather than thrown.
 *
 * A bulk import decides one row at a time and reports each refusal against its
 * line number, so it needs the answer, not an exception that would take the
 * other 499 rows with it.
 *
 * `assertInScope` is written in terms of THIS function rather than repeating
 * the test, because two copies of a rule diverge on exactly the case that
 * matters — and here that case is "a NULL city is not visible to a scoped
 * principal", which is the half everyone gets backwards.
 */
export function inScope(
  principal: Principal,
  row: { cityId?: string | null; collegeId?: string | null },
): boolean {
  if (principal.cityScope !== null) {
    const city = row.cityId ?? null;
    if (city === null || !principal.cityScope.includes(city)) return false;
  }
  if (principal.collegeScope !== null) {
    if ((row.collegeId ?? null) !== principal.collegeScope) return false;
  }
  return true;
}

/**
 * The soft-delete predicate (ADR 0002).
 *
 * `includeDeleted` is a deliberate opt-in: operational reads exclude removed
 * rows, and financial or historical reports include them because the events
 * they record still happened.
 */
export const liveOnly = (includeDeleted = false): { deletedAt?: null } =>
  includeDeleted ? {} : { deletedAt: null };

/* ── The trainer axis ──────────────────────────────────────────────────────
 *
 * City and college scope are COLUMNS: a row is in scope when its column
 * matches. A trainer's is a RELATIONSHIP, so these are relation filters rather
 * than field comparisons, and they traverse from `principal.trainerScope`.
 *
 * Two properties have to be decided rather than assumed, and both are decided
 * here so no service decides them differently:
 *
 * **Reading and writing are not the same set.** A trainer released from a
 * batch loses the roster at the moment of release — but they delivered those
 * sessions, and the attendance and grades they wrote stay attributable to
 * them. So history stays readable and the ability to write more stops.
 *
 * **The session is more precise than the batch.** `batch_sessions.trainer_id`
 * is per session, and a substitute for one day is a legitimate thing the
 * schema models. Attendance and completion authorise on the SESSION's trainer;
 * reading the schedule authorises on the batch.
 */

/** True when this principal's reach is a teaching relationship. */
export const isTrainer = (principal: Principal): boolean =>
  principal.actor === "TRAINER" && principal.trainerScope !== null;

/**
 * The batches a trainer may READ.
 *
 * Primary trainer, or a live CONFIRMED assignment. A PROPOSED one is not
 * enough — an invitation is not a cohort, and a trainer who could read the
 * roster of every batch they were ever offered would be reading students they
 * never taught.
 *
 * Returns `{}` for anyone else, so a service spreads it unconditionally.
 */
export function trainerBatchScope(principal: Principal): Record<string, unknown> {
  if (!isTrainer(principal)) return {};
  return {
    OR: [
      { primaryTrainerId: principal.trainerScope },
      {
        trainerAssignments: {
          some: { trainerId: principal.trainerScope, status: "CONFIRMED", deletedAt: null },
        },
      },
    ],
  };
}

/**
 * The sessions a trainer may READ.
 *
 * Their own sessions, plus every session of a batch that is currently theirs.
 * The first half is what keeps HISTORY: a session they delivered stays visible
 * after they are released from the batch, because `trainer_id` on the row
 * records that they were the one who taught it.
 */
export function trainerSessionScope(principal: Principal): Record<string, unknown> {
  if (!isTrainer(principal)) return {};
  return {
    OR: [{ trainerId: principal.trainerScope }, { batch: trainerBatchScope(principal) }],
  };
}

/**
 * The shape both trainer rules read.
 *
 * Named, because read and write must be answered from the SAME row shape — a
 * read gate that loaded one relation fewer would be a second definition of
 * "theirs" wearing the same word.
 */
export type TrainerSessionShape = {
  trainerId: string | null;
  batch: {
    primaryTrainerId: string | null;
    trainerAssignments: { trainerId: string; status: string; deletedAt: Date | null }[];
  };
};

/**
 * Is this cohort theirs NOW — primary trainer, or a live CONFIRMED assignment.
 *
 * One definition, shared by the read rule and the write rule below, because
 * this is the half they agree on. A PROPOSED assignment is not enough: an
 * invitation is not a cohort.
 */
function batchIsTheirsNow(me: string, batch: TrainerSessionShape["batch"]): boolean {
  return (
    batch.primaryTrainerId === me ||
    batch.trainerAssignments.some(
      (a) => a.trainerId === me && a.status === "CONFIRMED" && a.deletedAt === null,
    )
  );
}

/**
 * Whether this trainer may READ a session.
 *
 * Their own session — `trainer_id` records that they delivered it, and that
 * does not stop being true when they are released — or any session of a batch
 * that is theirs now.
 *
 * ── Why this is a function and not an inline test ───────────────────────
 *
 * It was inline, expressed as "not their session AND not writable", and that
 * made READING depend on the WRITE rule. Breaking `trainerMayWrite` in a
 * fault-injection run therefore opened the read as well: one wrong line and a
 * trainer could read a cohort that was never theirs. The two rules differ by
 * exactly one clause and that clause is now the only thing written twice.
 */
export function trainerMayRead(principal: Principal, session: TrainerSessionShape): boolean {
  if (!isTrainer(principal)) return true;
  const me = principal.trainerScope;
  if (me === null) return false;
  // The history clause. This is the ONLY difference from the write rule.
  if (session.trainerId === me) return true;
  return batchIsTheirsNow(me, session.batch);
}

/**
 * The ASSIGNMENTS, and therefore the submissions, a trainer may read.
 *
 * ── Why this needed its own name ───────────────────────────────────────
 *
 * `GET /batches/submissions` applied city and college scope and nothing else.
 * Both are null for a trainer, so both fragments were `{}` and the list returned
 * every submission in the estate — another cohort's students, by name, with the
 * work they handed in. The WRITE was guarded: `gradeSubmission` calls
 * `assertTrainerMayWrite` and refuses a foreign submission with a 404. The read
 * filter was simply never added, which is the same shape as the three acts the
 * college audit found open — the dangerous half of a rule is the half nobody
 * had to write to make the feature work.
 *
 * ── Why the OR sits on the ASSIGNMENT ──────────────────────────────────
 *
 * An assignment may hang off a session or off the batch alone (invariant 16), so
 * a filter that reached through `session` would silently drop every
 * batch-level assignment — a leak's opposite, and just as wrong. The session
 * branch is what keeps history readable: work set against a day they taught
 * stays theirs to read after they are released, exactly as the attendance they
 * wrote does.
 */
export function trainerAssignmentScope(principal: Principal): Record<string, unknown> {
  if (!isTrainer(principal)) return {};
  return {
    OR: [
      { session: { trainerId: principal.trainerScope } },
      { batch: trainerBatchScope(principal) },
    ],
  };
}

/**
 * Whether this trainer may WRITE against a session — mark it delivered, take
 * attendance, set work, attach a recording.
 *
 * Deliberately narrower than reading, and narrower than the batch:
 *
 *   · the session's trainer must be them, so a colleague on the same cohort
 *     cannot write against a day they did not teach;
 *   · the batch must be theirs NOW, so a released trainer stops writing while
 *     keeping everything they already wrote.
 *
 * Anyone who is not a trainer passes — an admin's authority here is their
 * module permission plus city scope, which the caller has already applied.
 */
export function trainerMayWrite(principal: Principal, session: TrainerSessionShape): boolean {
  if (!isTrainer(principal)) return true;
  const me = principal.trainerScope;
  if (me === null) return false;
  if (session.trainerId !== me) return false;
  return batchIsTheirsNow(me, session.batch);
}

/**
 * The same, thrown.
 *
 * A 404 rather than a 403, for the reason `assertInScope` gives: a refusal
 * that distinguishes "not yours" from "does not exist" is itself a way to
 * enumerate what exists.
 */
export function assertTrainerMayWrite(
  principal: Principal,
  session: TrainerSessionShape,
): void {
  if (!trainerMayWrite(principal, session)) throw ApiException.outOfScope();
}

/**
 * The read rule, thrown — and it throws the SAME refusal as the write.
 *
 * A session that is not theirs reads as not found, so a refusal cannot be used
 * to discover which cohorts exist.
 */
export function assertTrainerMayRead(
  principal: Principal,
  session: TrainerSessionShape,
): void {
  if (!trainerMayRead(principal, session)) throw ApiException.outOfScope();
}

/**
 * The second hop.
 *
 * "May this trainer write attendance for this student?" is TWO questions: is
 * this session mine, and is this student on that session's batch roster.
 * Neither alone is sufficient — the first alone lets a trainer mark any
 * student in the database against their own session, and the second alone lets
 * any trainer of that cohort write against a day they did not deliver.
 *
 * This is the half that is easy to leave out, because the first check passing
 * feels like the answer.
 */
export function assertOnRoster(studentIds: string[], roster: Set<string>): void {
  const strangers = studentIds.filter((id) => !roster.has(id));
  if (strangers.length > 0) {
    throw ApiException.validation({
      attendance: `${strangers.length} of those students are not on this batch's roster`,
    });
  }
}

/**
 * A trainer acting on a trainer record: it must be their own.
 *
 * ── Why this is not covered by scope ───────────────────────────────────
 *
 * `assertInScope` asks about city and college, and a trainer has neither — so
 * every trainer record passes it. Nothing else stood between trainer A and
 * declaring leave in trainer B's calendar, or answering B's invitation, because
 * until now nothing but an admin ever called those paths and an admin acting on
 * somebody's behalf is the whole point of them.
 *
 * Silent for every other actor, so an admin recording a trainer's answer keeps
 * working unchanged.
 */
export function assertOwnTrainerRecord(principal: Principal, trainerId: string): void {
  if (!isTrainer(principal)) return;
  if (principal.trainerScope !== trainerId) throw ApiException.outOfScope();
}

/* ── The college axis, on the WRITE side ────────────────────────────────────
 *
 * `collegeScope` above answers "which rows". This answers a different
 * question: which ACTS. A college portal user is scoped to their own
 * institution and every row they can reach is legitimately theirs — so scope
 * has nothing left to say about whether they may confirm their own
 * requirement, revoke their student's certificate, or suspend that student's
 * account. Those are not visibility questions. They are ours to decide.
 *
 * ── Why a named function rather than the check itself ──────────────────────
 *
 * The check itself was already here, written out by hand as
 * `if (principal.collegeScope !== null) throw ApiException.forbidden()`, in
 * five places in `requirements.service.ts` — confirm, reject, fulfil, and the
 * two portal-access verbs. It was correct in all five. It was also absent from
 * every act added afterwards, and driving the real API as a real college user
 * found three that mattered: revoking a certificate answered 200, suspending a
 * student answered 200, and removing one from a roster answered 204.
 *
 * A rule that must be remembered at each new call site is a rule that will be
 * forgotten at one of them. Naming it does not make it stronger — it makes it
 * greppable, and it gives the reason one home instead of five.
 *
 * ── Why 403 here and 404 for scope ────────────────────────────────────────
 *
 * `assertInScope` throws a 404 on purpose: a 403 would confirm that a record
 * exists in another region, which is itself the leak. Here the record is the
 * caller's OWN — they are looking at their requirement, their student, their
 * certificate. Hiding it would be a lie, and "not found" on a row they can see
 * listed reads as a bug rather than a refusal. What they may not do is act, so
 * the honest answer is that they may not.
 */

/** True when this principal is acting for one institution. */
export const isCollegeUser = (principal: Principal): boolean =>
  principal.actor === "COLLEGE_USER" || principal.collegeScope !== null;

/**
 * Refuses an act that belongs to US rather than to the institution.
 *
 * `act` completes the sentence a college user reads, so the refusal says which
 * decision is not theirs rather than only that something was refused.
 *
 *     assertOursToDecide(principal, "confirm a requirement");
 *
 * Silent for everybody else: an admin, an API client and the cron pass
 * through, and their authority is their permission plus city scope, which the
 * caller has already applied.
 */
export function assertOursToDecide(principal: Principal, act: string): void {
  if (!isCollegeUser(principal)) return;
  throw ApiException.forbidden(
    `Only Gurukulam can ${act}. Your college's copy of this record is unchanged.`,
  );
}
