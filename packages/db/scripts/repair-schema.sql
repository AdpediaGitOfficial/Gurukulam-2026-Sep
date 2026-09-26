-- Adds whatever the additive migrations were supposed to add and did not.
--
--     sudo -u postgres pg_dump gurukulam > ~/before-repair.sql   -- FIRST
--     sudo -u postgres psql gurukulam -f packages/db/scripts/repair-schema.sql
--     sudo -u postgres psql gurukulam -f packages/db/scripts/check-columns.sql
--
-- ── What this is for ────────────────────────────────────────────────────
--
-- The live database was missing `trainers.engagement` — a column
-- 20260908120000_in_house_trainers adds and every later read assumes. Creating
-- a batch and scheduling a session both answered 500, because both screens
-- load the trainer picker and that query selects every scalar column on the
-- table. Nothing else on either page touches it, which is why twelve screens
-- worked and three did not.
--
-- ── Why it is safe to run more than once ────────────────────────────────
--
-- Every statement is guarded, so this is a no-op against a database that is
-- already correct. Run it, then run check-columns.sql and read the verdict —
-- that is the confirmation, not this script's silence.
--
-- ── Why it is additive only ─────────────────────────────────────────────
--
-- Nothing here drops, rewrites or backfills anything. Each column arrives with
-- the same default its migration gave it, so existing rows land in the same
-- state they would have been in had the migration run at the time. FREELANCE
-- for engagement in particular is deliberate: it is the only kind of trainer
-- that existed before the column, and an existing row must not silently become
-- staff, because that changes who may be put on a batch without being asked.
--
-- This does NOT create the CHECK constraints, GENERATED columns or partial
-- unique indexes from 20260903075500_constraints. Those enforce the invariants
-- and a database missing them needs a different conversation — if
-- diagnose-schema.sql reports section 2 MISSING, stop and say so rather than
-- running this and assuming it is handled.

BEGIN;

-- ── 20260908120000_in_house_trainers ────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TrainerEngagement') THEN
    CREATE TYPE "TrainerEngagement" AS ENUM ('IN_HOUSE', 'FREELANCE');
    RAISE NOTICE 'created type TrainerEngagement';
  END IF;
END $$;

ALTER TABLE "trainers"
  ADD COLUMN IF NOT EXISTS "engagement" "TrainerEngagement" NOT NULL DEFAULT 'FREELANCE';

ALTER TABLE "batch_trainer_assignments"
  ADD COLUMN IF NOT EXISTS "auto_confirmed" BOOLEAN NOT NULL DEFAULT false;

-- ── 20260908130000_assignment_release_reason ────────────────────────────
ALTER TABLE "batch_trainer_assignments"
  ADD COLUMN IF NOT EXISTS "release_reason" VARCHAR(500);

-- ── 20260904121708_trainer_suspension_reason ────────────────────────────
ALTER TABLE "trainers" ADD COLUMN IF NOT EXISTS "suspended_at" TIMESTAMP(3);
ALTER TABLE "trainers" ADD COLUMN IF NOT EXISTS "suspended_reason" VARCHAR(500);

-- ── 20260904111720_college_user_revoke_reason ───────────────────────────
ALTER TABLE "college_users" ADD COLUMN IF NOT EXISTS "revoke_reason" VARCHAR(500);

-- ── 20260903113810_portal_login_identity ────────────────────────────────
-- Uniqueness is scoped to LIVE rows and is case-insensitive, matching how the
-- auth service looks an identity up: a plain unique index would let "SNC@…"
-- and "snc@…" coexist and then both match the same login.
ALTER TABLE "college_users" ADD COLUMN IF NOT EXISTS "login_email" VARCHAR(255);
ALTER TABLE "students"      ADD COLUMN IF NOT EXISTS "login_email" VARCHAR(255);
ALTER TABLE "trainers"      ADD COLUMN IF NOT EXISTS "login_email" VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS "college_users_login_email_live_key"
  ON "college_users" (LOWER("login_email"))
  WHERE "deleted_at" IS NULL AND "login_email" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "trainers_login_email_live_key"
  ON "trainers" (LOWER("login_email"))
  WHERE "deleted_at" IS NULL AND "login_email" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "students_login_email_live_key"
  ON "students" (LOWER("login_email"))
  WHERE "deleted_at" IS NULL AND "login_email" IS NOT NULL;

-- ── 20260916120000_college_partnership_type ─────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PartnershipType') THEN
    CREATE TYPE "PartnershipType" AS ENUM ('B2B', 'HUB', 'PLACEMENT');
    RAISE NOTICE 'created type PartnershipType';
  END IF;
END $$;

ALTER TABLE "colleges"
  ADD COLUMN IF NOT EXISTS "partnership_type" "PartnershipType" NOT NULL DEFAULT 'B2B';

CREATE INDEX IF NOT EXISTS "colleges_partnership_type_idx"
  ON "colleges" ("partnership_type") WHERE "deleted_at" IS NULL;

-- ── 20260916090000_session_day_uniqueness ───────────────────────────────
-- A batch cannot sit in two places at once. This is the constraint that makes
-- bulk session upload safe: the same file pasted twice collides here rather
-- than quietly doubling a fortnight.
--
-- It will FAIL if the data already violates it, and that failure is the point
-- — it means two live sessions already claim one cohort at one moment, and
-- somebody has to decide which is right. Run the query in section 3 of
-- diagnose-schema.sql to see the pairs, fix them in the console, then re-run.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_batch_sessions_batch_day_start"
  ON "batch_sessions" ("batch_id", "scheduled_date", "start_time")
  WHERE "deleted_at" IS NULL AND "status" <> 'CANCELLED';

COMMIT;
