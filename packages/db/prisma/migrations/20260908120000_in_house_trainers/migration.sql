-- In-house trainers, and the assignments made without asking them.
--
-- Hand-written. `prisma migrate dev` cannot diff this schema: it does not know
-- college_contracts.computed_total_minor is a GENERATED column and asks to
-- reset the database rather than emit an ALTER. See ADR 0003.
--
-- FREELANCE is the default because it is the only kind of trainer that existed
-- before this column: an existing row must not silently become staff, since
-- that would change who may be put on a batch without being asked.
CREATE TYPE "TrainerEngagement" AS ENUM ('IN_HOUSE', 'FREELANCE');

ALTER TABLE "trainers"
  ADD COLUMN "engagement" "TrainerEngagement" NOT NULL DEFAULT 'FREELANCE';

-- Confirmed on assignment rather than by the trainer answering. `responded_at`
-- is set in both cases and so cannot distinguish them on its own.
ALTER TABLE "batch_trainer_assignments"
  ADD COLUMN "auto_confirmed" BOOLEAN NOT NULL DEFAULT false;
