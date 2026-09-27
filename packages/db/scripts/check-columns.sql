-- Every object the migrations add, checked one by one.
--
--     sudo -u postgres psql gurukulam -f packages/db/scripts/check-columns.sql
--
-- ── Why this exists ─────────────────────────────────────────────────────
--
-- `diagnose-schema.sql` asks whether 20260903075500_constraints ran, because
-- that is the migration whose absence breaks the INVARIANTS silently. It did
-- not ask about the ordinary additive migrations that came after, on the
-- assumption that a schema either has them all or is obviously broken.
--
-- It is not obvious. The live database was missing `trainers.engagement` from
-- 20260908120000_in_house_trainers, and the only symptom was that creating a
-- batch and scheduling a session both answered 500 — because both screens load
-- the trainer picker, and nothing else on those pages reads that column. Three
-- screens down, nine working, and no error anybody could act on.
--
-- So this checks EVERY column, type and index the migrations add, by name.
-- A row that reads MISSING names the migration whose SQL has to be applied.
--
-- Read it before baselining anything: marking a migration applied when its
-- objects are absent tells Prisma the work is done and hides the gap for good.
\pset format aligned
\pset border 2

\echo ''
\echo '=== Objects each migration adds ========================================='
\echo ''

WITH expected(migration, kind, tbl, obj) AS (
  VALUES
    -- 20260903075500_constraints — the three generated money columns.
    ('constraints',            'column', 'student_fee_ledger',        'discount_amount_minor'),
    ('constraints',            'column', 'college_contracts',         'computed_total_minor'),
    ('constraints',            'column', 'college_contracts',         'total_value_minor'),

    -- 20260903113810_portal_login_identity — the login identity, separate
    -- from the contact address, on all three portal actors.
    ('portal_login_identity',  'column', 'college_users',             'login_email'),
    ('portal_login_identity',  'column', 'students',                  'login_email'),
    ('portal_login_identity',  'column', 'trainers',                  'login_email'),
    ('portal_login_identity',  'index',  '',                          'college_users_login_email_live_key'),
    ('portal_login_identity',  'index',  '',                          'trainers_login_email_live_key'),
    ('portal_login_identity',  'index',  '',                          'students_login_email_live_key'),

    ('college_user_revoke',    'column', 'college_users',             'revoke_reason'),

    ('trainer_suspension',     'column', 'trainers',                  'suspended_at'),
    ('trainer_suspension',     'column', 'trainers',                  'suspended_reason'),

    -- 20260908120000_in_house_trainers — this is the one that was missing.
    ('in_house_trainers',      'type',   '',                          'TrainerEngagement'),
    ('in_house_trainers',      'column', 'trainers',                  'engagement'),
    ('in_house_trainers',      'column', 'batch_trainer_assignments', 'auto_confirmed'),

    ('assignment_release',     'column', 'batch_trainer_assignments', 'release_reason'),

    -- The two this release needs.
    ('session_day_uniqueness', 'index',  '',                          'uq_batch_sessions_batch_day_start'),
    ('college_partnership',    'type',   '',                          'PartnershipType'),
    ('college_partnership',    'column', 'colleges',                  'partnership_type'),
    ('college_partnership',    'index',  '',                          'colleges_partnership_type_idx')
)
SELECT
  migration,
  kind,
  CASE WHEN tbl = '' THEN obj ELSE tbl || '.' || obj END AS object,
  CASE
    WHEN kind = 'column' AND EXISTS (
      SELECT 1 FROM information_schema.columns c
       WHERE c.table_name = tbl AND c.column_name = obj
    ) THEN 'present'
    WHEN kind = 'index' AND EXISTS (
      SELECT 1 FROM pg_indexes i WHERE i.indexname = obj
    ) THEN 'present'
    WHEN kind = 'type' AND EXISTS (
      SELECT 1 FROM pg_type t WHERE t.typname = obj
    ) THEN 'present'
    ELSE 'MISSING'
  END AS verdict
FROM expected
ORDER BY migration, kind, object;

\echo ''
\echo '=== Verdict ============================================================='

WITH expected(kind, tbl, obj) AS (
  VALUES
    ('column', 'student_fee_ledger', 'discount_amount_minor'),
    ('column', 'college_contracts', 'computed_total_minor'),
    ('column', 'college_contracts', 'total_value_minor'),
    ('column', 'college_users', 'login_email'),
    ('column', 'students', 'login_email'),
    ('column', 'trainers', 'login_email'),
    ('index', '', 'college_users_login_email_live_key'),
    ('index', '', 'trainers_login_email_live_key'),
    ('index', '', 'students_login_email_live_key'),
    ('column', 'college_users', 'revoke_reason'),
    ('column', 'trainers', 'suspended_at'),
    ('column', 'trainers', 'suspended_reason'),
    ('type', '', 'TrainerEngagement'),
    ('column', 'trainers', 'engagement'),
    ('column', 'batch_trainer_assignments', 'auto_confirmed'),
    ('column', 'batch_trainer_assignments', 'release_reason'),
    ('index', '', 'uq_batch_sessions_batch_day_start'),
    ('type', '', 'PartnershipType'),
    ('column', 'colleges', 'partnership_type'),
    ('index', '', 'colleges_partnership_type_idx')
)
SELECT
  count(*) FILTER (WHERE missing) AS missing_objects,
  CASE WHEN count(*) FILTER (WHERE missing) = 0
       THEN 'Every additive object is present.'
       ELSE 'Run packages/db/scripts/repair-schema.sql, then re-run this.'
  END AS what_to_do
FROM (
  SELECT NOT (
    (kind = 'column' AND EXISTS (SELECT 1 FROM information_schema.columns c
                                  WHERE c.table_name = tbl AND c.column_name = obj))
    OR (kind = 'index' AND EXISTS (SELECT 1 FROM pg_indexes i WHERE i.indexname = obj))
    OR (kind = 'type'  AND EXISTS (SELECT 1 FROM pg_type t WHERE t.typname = obj))
  ) AS missing
  FROM expected
) q;

\echo ''
