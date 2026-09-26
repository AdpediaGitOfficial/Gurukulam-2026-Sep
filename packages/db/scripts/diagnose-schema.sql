-- What state is this database actually in?
--
--     sudo -u postgres psql gurukulam -f packages/db/scripts/diagnose-schema.sql
--
-- Run this before baselining anything. `prisma migrate deploy` refused the live
-- database with P3005 — "the database schema is not empty" — which means the
-- tables exist but `_prisma_migrations` does not know about any of them. There
-- are two very different ways to arrive there and they need opposite fixes:
--
--   · The schema was created by `prisma db push`, or restored from a dump taken
--     from such a database. `db push` applies the SCHEMA and skips every
--     hand-written migration, so the CHECK constraints, the GENERATED columns
--     and the partial unique indexes in 20260903075500_constraints were never
--     created. Baselining would mark them "applied" and hide that permanently.
--
--   · The schema was migrated properly and the _prisma_migrations table was
--     later lost — dropped, or left behind by a selective restore. Here the
--     objects all exist and baselining is exactly right.
--
-- The difference is visible: this asks whether the objects those migrations
-- create are actually present. Read the last three rows.
\pset format aligned
\pset border 2

\echo ''
\echo '=== 1. What Prisma thinks has been applied ==============================='
SELECT COALESCE(
  (SELECT string_agg(migration_name, E'\n' ORDER BY finished_at)
     FROM _prisma_migrations WHERE finished_at IS NOT NULL),
  '(none — this is why migrate deploy refused with P3005)'
) AS applied_migrations
\gset
\echo :applied_migrations

\echo ''
\echo '=== 2. Objects 20260903075500_constraints is supposed to create =========='

-- Eight named CHECKs stand in for the whole set: the migration creates more,
-- but these are the ones the invariants turn on, and they are created in the
-- same statement batch — if these are here, that migration ran.
SELECT
  'CHECK constraints (8 sampled)'                AS object_kind,
  count(*)                                       AS found,
  8                                              AS expected,
  CASE WHEN count(*) = 8 THEN 'present' ELSE 'MISSING' END AS verdict
  FROM pg_constraint
 WHERE contype = 'c'
   AND conname IN (
     'fee_installments_exactly_one_parent',
     'payment_transactions_txn_id_required_unless_cash',
     'payment_transactions_reversal_is_explained',
     'college_contracts_override_is_explained',
     'college_contracts_basis_has_its_input',
     'certificates_revocation_is_explained',
     'fee_installments_amounts_non_negative',
     'fee_installments_no_overpayment'
   )

UNION ALL

SELECT
  'GENERATED columns',
  count(*), 3,
  CASE WHEN count(*) = 3 THEN 'present' ELSE 'MISSING' END
  FROM information_schema.columns
 WHERE is_generated = 'ALWAYS'
   AND (table_name, column_name) IN (
     ('student_fee_ledger', 'discount_amount_minor'),
     ('college_contracts',  'computed_total_minor'),
     ('college_contracts',  'total_value_minor')
   )

UNION ALL

SELECT
  'partial unique indexes (live-row keys)',
  count(*), 6,
  CASE WHEN count(*) = 6 THEN 'present' ELSE 'MISSING' END
  FROM pg_indexes
 WHERE indexname IN (
   'admin_users_email_live_key', 'college_users_email_live_key',
   'trainers_email_live_key',    'students_email_live_key',
   'roles_name_live_key',        'student_batch_mapping_live_key'
 )

UNION ALL

SELECT
  'this release''s session-day index',
  count(*), 1,
  CASE WHEN count(*) = 1 THEN 'present' ELSE 'not yet applied (expected)' END
  FROM pg_indexes
 WHERE indexname = 'uq_batch_sessions_batch_day_start';

\echo ''
\echo '=== 3. Would this release''s migration be accepted? ======================='
\echo '(rows here are two live sessions claiming one cohort at one moment)'
SELECT batch_id, scheduled_date, start_time, count(*) AS clashing,
       string_agg(session_code, ', ') AS sessions
  FROM batch_sessions
 WHERE deleted_at IS NULL AND status <> 'CANCELLED'
 GROUP BY 1, 2, 3
HAVING count(*) > 1;

\echo ''
\echo 'READ IT LIKE THIS:'
\echo '  Section 2 all "present"  -> the schema was migrated properly and the'
\echo '    history was lost. Baseline it: deploy-runbook.md section 8.'
\echo '  Anything "MISSING"       -> those objects were never created, so the'
\echo '    invariants they enforce are NOT enforced on this database. Do NOT'
\echo '    baseline past them — apply that migration SQL first.'
\echo '  Section 3 returns rows   -> resolve them in the console before'
\echo '    deploying, or the new unique index will be rejected.'
\echo ''
