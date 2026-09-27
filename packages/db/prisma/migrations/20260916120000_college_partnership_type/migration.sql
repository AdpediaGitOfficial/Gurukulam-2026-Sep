-- The partnership a college is on.
--
-- Specified in admin-portal-plan.md M3 — "partnership_type of B2B / HUB /
-- PLACEMENT" — and never built, so the directory has been unable to answer
-- "what kind of relationship is this" since the module landed.
--
-- Hand-written per ADR 0003. Additive: a default means every existing college
-- keeps behaving as it did, and B2B is the right default because it is what
-- the model is built around — a dedicated batch, a contract, the institution
-- billed. A hub or a placement partner is the exception you choose.
CREATE TYPE "PartnershipType" AS ENUM ('B2B', 'HUB', 'PLACEMENT');

ALTER TABLE "colleges"
  ADD COLUMN "partnership_type" "PartnershipType" NOT NULL DEFAULT 'B2B';

-- The directory filters on it, and a filter without an index is a sequential
-- scan of every college on every page load.
CREATE INDEX "colleges_partnership_type_idx"
  ON "colleges" ("partnership_type") WHERE "deleted_at" IS NULL;
