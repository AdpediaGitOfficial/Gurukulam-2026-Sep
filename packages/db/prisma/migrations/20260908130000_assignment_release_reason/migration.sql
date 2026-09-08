-- Why an admin released a trainer from a batch.
--
-- Hand-written; `prisma migrate dev` cannot diff this schema (ADR 0003).
--
-- Distinct from decline_reason, which is the trainer's own answer. Releasing a
-- CONFIRMED trainer un-staffs the batch and clears its scheduled sessions, so
-- it needs the same stated reason that revoking a portal login and suspending
-- an account already carry.
ALTER TABLE "batch_trainer_assignments"
  ADD COLUMN "release_reason" VARCHAR(500);
