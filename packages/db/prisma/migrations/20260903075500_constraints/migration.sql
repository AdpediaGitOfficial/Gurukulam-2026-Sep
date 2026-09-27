-- Constraints Prisma's schema language cannot express.
--
-- Everything in this file is deliberate and hand-written. Prisma does not know
-- about generated columns, CHECK constraints or partial indexes, so it will
-- propose reverting them on a later `migrate dev`. See packages/db/README.md
-- ("Working with the hand-written constraints") before applying any migration
-- that touches the objects below.

-- ═══════════════════════════════════════════════════════════════════════════
--  1. Generated columns
-- ═══════════════════════════════════════════════════════════════════════════

-- student_fee_ledger.discount_amount_minor
-- The source spec declared this GENERATED ALWAYS … STORED. Keeping it in the
-- database means the discount can never disagree with the two values it is
-- derived from.
ALTER TABLE "student_fee_ledger" DROP COLUMN "discount_amount_minor";
ALTER TABLE "student_fee_ledger"
  ADD COLUMN "discount_amount_minor" BIGINT
  GENERATED ALWAYS AS ("course_value_minor" - "enrolment_value_minor") STORED;

-- college_contracts.computed_total_minor  (ADR 0003)
-- Per-student contracts multiply the rate by the billable headcount; flat
-- cohort contracts take the flat price.
ALTER TABLE "college_contracts" DROP COLUMN "computed_total_minor";
ALTER TABLE "college_contracts"
  ADD COLUMN "computed_total_minor" BIGINT
  GENERATED ALWAYS AS (
    CASE "commercial_basis"
      WHEN 'PER_STUDENT' THEN "per_student_rate_minor" * "billable_headcount"
      WHEN 'FLAT_COHORT' THEN "flat_cohort_price_minor"
    END
  ) STORED;

-- college_contracts.total_value_minor
-- PostgreSQL forbids a generated column referencing another generated column,
-- so the computed expression is repeated here rather than COALESCE-ing over
-- computed_total_minor. This is the ONLY total the ledger, invoices and
-- reports read.
ALTER TABLE "college_contracts" DROP COLUMN "total_value_minor";
ALTER TABLE "college_contracts"
  ADD COLUMN "total_value_minor" BIGINT
  GENERATED ALWAYS AS (
    COALESCE(
      "override_total_minor",
      CASE "commercial_basis"
        WHEN 'PER_STUDENT' THEN "per_student_rate_minor" * "billable_headcount"
        WHEN 'FLAT_COHORT' THEN "flat_cohort_price_minor"
      END
    )
  ) STORED;

-- ═══════════════════════════════════════════════════════════════════════════
--  2. CHECK constraints — the invariants that belong in the schema
-- ═══════════════════════════════════════════════════════════════════════════

-- Invariant 4: an installment hangs off EXACTLY ONE parent — a student ledger
-- or a college contract. Never both, never neither. This is what makes one
-- installment engine safe to point at two billing levels.
ALTER TABLE "fee_installments"
  ADD CONSTRAINT "fee_installments_exactly_one_parent"
  CHECK (num_nonnulls("ledger_id", "contract_id") = 1);

-- Transaction ID is required for every payment mode except cash.
ALTER TABLE "payment_transactions"
  ADD CONSTRAINT "payment_transactions_txn_id_required_unless_cash"
  CHECK ("payment_mode" = 'CASH' OR "external_transaction_id" IS NOT NULL);

-- A reversal must say what it reverses and why. A receipt is a financial
-- record; the correction is a reversing entry, not a delete.
ALTER TABLE "payment_transactions"
  ADD CONSTRAINT "payment_transactions_reversal_is_explained"
  CHECK (
    "is_reversal" = false
    OR ("reverses_transaction_id" IS NOT NULL AND "reversal_reason" IS NOT NULL)
  );

-- ADR 0003: an overridden total must carry its reason. An unexplained
-- discount is the first thing an audit asks about.
ALTER TABLE "college_contracts"
  ADD CONSTRAINT "college_contracts_override_is_explained"
  CHECK ("override_total_minor" IS NULL OR "override_reason" IS NOT NULL);

-- ADR 0003: the commercial basis must carry the input it bills on.
ALTER TABLE "college_contracts"
  ADD CONSTRAINT "college_contracts_basis_has_its_input"
  CHECK (
    ("commercial_basis" = 'PER_STUDENT' AND "per_student_rate_minor" IS NOT NULL)
    OR ("commercial_basis" = 'FLAT_COHORT' AND "flat_cohort_price_minor" IS NOT NULL)
  );

-- A revoked certificate must say why. Revocation is visible on the public
-- verifier immediately, so the reason is not optional.
ALTER TABLE "certificates"
  ADD CONSTRAINT "certificates_revocation_is_explained"
  CHECK ("revoked_at" IS NULL OR "revoked_reason" IS NOT NULL);

-- Money is never negative. Amounts are integer minor units (paise).
ALTER TABLE "fee_installments"
  ADD CONSTRAINT "fee_installments_amounts_non_negative"
  CHECK ("amount_minor" >= 0 AND "paid_amount_minor" >= 0);

-- Invariant 13: overpayment is refused at write time. The service checks the
-- remaining due before writing; this is the backstop that makes a bug in that
-- service a failed transaction rather than a wrong balance.
ALTER TABLE "fee_installments"
  ADD CONSTRAINT "fee_installments_no_overpayment"
  CHECK ("paid_amount_minor" <= "amount_minor");

ALTER TABLE "student_fee_ledger"
  ADD CONSTRAINT "student_fee_ledger_amounts_non_negative"
  CHECK (
    "course_value_minor" >= 0 AND "enrolment_value_minor" >= 0
    AND "advance_paid_minor" >= 0 AND "total_paid_minor" >= 0
  );

ALTER TABLE "payment_transactions"
  ADD CONSTRAINT "payment_transactions_amount_non_negative"
  CHECK ("amount_minor" >= 0);

ALTER TABLE "courses"
  ADD CONSTRAINT "courses_standard_market_value_non_negative"
  CHECK ("standard_market_value_minor" >= 0);

-- Date and time sanity.
ALTER TABLE "batches"
  ADD CONSTRAINT "batches_end_after_start"
  CHECK ("end_date" IS NULL OR "end_date" >= "start_date");

ALTER TABLE "batch_sessions"
  ADD CONSTRAINT "batch_sessions_end_after_start"
  CHECK ("end_time" > "start_time");

ALTER TABLE "trainer_availability"
  ADD CONSTRAINT "trainer_availability_end_after_start"
  CHECK ("ends_at" > "starts_at");

ALTER TABLE "college_requirements"
  ADD CONSTRAINT "college_requirements_window_ordered"
  CHECK (
    "preferred_window_start" IS NULL OR "preferred_window_end" IS NULL
    OR "preferred_window_end" >= "preferred_window_start"
  );

ALTER TABLE "college_requirements"
  ADD CONSTRAINT "college_requirements_headcount_positive"
  CHECK ("expected_headcount" > 0);

-- ═══════════════════════════════════════════════════════════════════════════
--  3. Partial unique indexes — uniqueness scoped to LIVE rows  (ADR 0002)
--
--  Business IDs are NOT in this section. They keep their unconditional unique
--  constraints from the baseline migration: an issued STU- or GK-CERT- must
--  stay permanently resolvable, because reports, receipts and the public
--  verifier point at it. Reusing one would silently re-target those.
--
--  Login identities are different. An email freed by a deletion should be
--  usable again, so their uniqueness is scoped to rows that are still live.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX "admin_users_email_live_key"
  ON "admin_users" (LOWER("email")) WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "college_users_email_live_key"
  ON "college_users" (LOWER("email")) WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "trainers_email_live_key"
  ON "trainers" (LOWER("email")) WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "students_email_live_key"
  ON "students" (LOWER("email")) WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "roles_name_live_key"
  ON "roles" (LOWER("name")) WHERE "deleted_at" IS NULL;

-- A student appears at most once on a live roster. Soft-deleted mappings stay,
-- so the same student can be re-enrolled into a batch they previously left.
CREATE UNIQUE INDEX "student_batch_mapping_live_key"
  ON "student_batch_mapping" ("student_id", "batch_id") WHERE "deleted_at" IS NULL;

-- A trainer is approved for a course once.
CREATE UNIQUE INDEX "trainer_courses_live_key"
  ON "trainer_courses" ("trainer_id", "course_id") WHERE "deleted_at" IS NULL;

-- One attendance row per student per session.
CREATE UNIQUE INDEX "student_attendance_live_key"
  ON "student_attendance" ("session_id", "student_id") WHERE "deleted_at" IS NULL;

-- One submission per student per assignment.
CREATE UNIQUE INDEX "assignment_submissions_live_key"
  ON "assignment_submissions" ("assignment_id", "student_id") WHERE "deleted_at" IS NULL;

-- Installment numbers are sequential within their parent, whichever parent
-- that is.
CREATE UNIQUE INDEX "fee_installments_ledger_number_live_key"
  ON "fee_installments" ("ledger_id", "installment_number")
  WHERE "deleted_at" IS NULL AND "ledger_id" IS NOT NULL;

CREATE UNIQUE INDEX "fee_installments_contract_number_live_key"
  ON "fee_installments" ("contract_id", "installment_number")
  WHERE "deleted_at" IS NULL AND "contract_id" IS NOT NULL;

-- Only one PROPOSED or CONFIRMED assignment per batch at a time. Declines are
-- retained with their reason and do not block a fresh proposal.
CREATE UNIQUE INDEX "batch_trainer_assignments_open_key"
  ON "batch_trainer_assignments" ("batch_id")
  WHERE "deleted_at" IS NULL AND "status" IN ('PROPOSED', 'CONFIRMED');

-- One live ledger per student per course. Invariant 3 — a college student has
-- none at all, which the allocation service enforces.
CREATE UNIQUE INDEX "student_fee_ledger_live_key"
  ON "student_fee_ledger" ("student_id", "course_id") WHERE "deleted_at" IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
--  4. Partial indexes for the queries that run constantly
-- ═══════════════════════════════════════════════════════════════════════════

-- The nightly reminder cron scans exactly this predicate.
CREATE INDEX "fee_installments_due_open_idx"
  ON "fee_installments" ("due_date")
  WHERE "deleted_at" IS NULL AND "status" IN ('PENDING', 'PARTIALLY_PAID', 'OVERDUE');

-- The bell. ACTION_REQUIRED rows that have not resolved.
CREATE INDEX "notifications_open_idx"
  ON "notifications" ("recipient_type", "recipient_id", "created_at")
  WHERE "status" = 'OPEN';

-- The unallocated-students queue: a live student with no live batch mapping.
-- Ageing buckets read created_at.
CREATE INDEX "students_live_created_idx"
  ON "students" ("created_at") WHERE "deleted_at" IS NULL;

-- Only PUBLISHED postings are visible to students.
CREATE INDEX "job_postings_published_idx"
  ON "job_postings" ("published_at")
  WHERE "deleted_at" IS NULL AND "status" = 'PUBLISHED';
