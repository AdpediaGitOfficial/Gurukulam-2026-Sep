-- Why a trainer's delivery was withdrawn, and when.
--
-- Hand-written. `prisma migrate dev` cannot diff this schema: it does not know
-- college_contracts.computed_total_minor is a GENERATED column and asks to
-- reset the database rather than emit an ALTER. See ADR 0003.
--
-- Mirrors students.suspended_at / suspended_reason exactly, so the two read the
-- same way and clear the same way.
ALTER TABLE "trainers"
  ADD COLUMN "suspended_at" TIMESTAMP(3),
  ADD COLUMN "suspended_reason" VARCHAR(500);
