-- A batch cannot sit in two places at once.
--
-- Hand-written; Prisma's schema language cannot express a partial index, and
-- `migrate dev` will propose reverting it (ADR 0003, packages/db/README.md).
--
-- This is the constraint that makes bulk session upload safe. An upload ADDS
-- to a batch's schedule and never replaces it, so the thing that can go wrong
-- is the opposite one: the same file pasted twice, or two operators pasting at
-- once, doubling a fortnight. `(batch, date, start time)` identifies a sitting
-- whether or not anybody typed a session code, so the second write collides
-- here rather than quietly succeeding. An in-process check cannot do this —
-- two concurrent transactions each read "no session at 09:30" and both insert.
--
-- CANCELLED is excluded deliberately. A session called off is a slot that
-- became free again, and scheduling its replacement on the same morning is
-- ordinary operations, not a duplicate.
CREATE UNIQUE INDEX "uq_batch_sessions_batch_day_start"
  ON "batch_sessions" ("batch_id", "scheduled_date", "start_time")
  WHERE "deleted_at" IS NULL AND "status" <> 'CANCELLED';
