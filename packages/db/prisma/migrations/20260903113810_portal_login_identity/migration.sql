-- Prisma's spurious DROP DEFAULT against the GENERATED ALWAYS columns removed
-- (packages/db/README.md, "Working with the hand-written constraints").
--
-- The portal LOGIN identity, separate from the contact address. Uniqueness is
-- scoped to live rows and is case-insensitive, matching how the auth service
-- looks an identity up — a unique index on the raw column would let
-- "SNC@..." and "snc@..." coexist and then match the same login.
-- AlterTable
ALTER TABLE "college_users" ADD COLUMN     "login_email" VARCHAR(255);

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "login_email" VARCHAR(255);

-- AlterTable
ALTER TABLE "trainers" ADD COLUMN     "login_email" VARCHAR(255);

CREATE UNIQUE INDEX "college_users_login_email_live_key"
  ON "college_users" (LOWER("login_email"))
  WHERE "deleted_at" IS NULL AND "login_email" IS NOT NULL;

CREATE UNIQUE INDEX "trainers_login_email_live_key"
  ON "trainers" (LOWER("login_email"))
  WHERE "deleted_at" IS NULL AND "login_email" IS NOT NULL;

CREATE UNIQUE INDEX "students_login_email_live_key"
  ON "students" (LOWER("login_email"))
  WHERE "deleted_at" IS NULL AND "login_email" IS NOT NULL;
