# ADR 0003 — A college contract stores both commercial bases

**Status:** Accepted · **Resolves:** `admin-portal-plan.md` §6 question 1

## Context

Is a college billed a per-student rate times headcount, or a flat price for the cohort? Both are
real. A college negotiating for 40 students on a known per-head rate and a college buying "one batch,
one price" are the same contract type with different arithmetic.

Headcount also drifts. A requirement says 40; 37 actually enrol. The contract must record **which
figure it bills on**, or the invoice total becomes an argument.

## Decision

`college_contracts` stores the basis, its inputs, and the total:

| Column | Meaning |
| --- | --- |
| `commercial_basis` | `PER_STUDENT` \| `FLAT_COHORT` — which arithmetic applies |
| `per_student_rate_minor` | The agreed rate. Null for a flat contract |
| `billable_headcount` | The headcount the total was computed from |
| `headcount_basis` | `REQUIREMENT` \| `ENROLLED` \| `MANUAL` — *which* figure that was |
| `computed_total_minor` | Derived: rate × headcount, or the flat price |
| `override_total_minor` | Set only when the negotiated total differs from the computed one |
| `override_reason` | Required whenever `override_total_minor` is set |
| `total_value_minor` | `COALESCE(override_total_minor, computed_total_minor)` — what is billed |

`total_value_minor` is the only column the ledger, invoices and reports read. Everything upstream of
it explains how it was reached.

## Consequences

- The negotiated total is never lost behind a recomputation. Changing the headcount updates
  `computed_total_minor` and leaves an override standing, with its reason visible.
- Installments hang off `total_value_minor` (see `fee_installments`' two-parent CHECK), so the
  schedule is unaffected by which basis produced it.
- An override without a reason is refused at write time — an unexplained discount is the thing an
  audit asks about first.
- Reporting can segment by `commercial_basis` and compare `computed` against `total`, which surfaces
  discounting patterns across colleges without a separate discount field.
- If a third basis ever appears (per-session, milestone), it is a new enum member plus its inputs —
  the total and everything downstream of it do not move.

## Working with these columns in Prisma

`computed_total_minor` and `total_value_minor` are **PostgreSQL generated columns**, created by raw
SQL in `20260903075500_constraints`. Prisma has no way to express that, so its schema models them as
ordinary nullable `BigInt`s.

The consequence is a trap, and it is permanent rather than a bug to fix: `prisma migrate dev` diffs
its own model against a shadow database built by replaying the migrations, sees a generated
expression it cannot account for, and proposes

```sql
ALTER TABLE "college_contracts" ALTER COLUMN "computed_total_minor" DROP DEFAULT, …
```

which Postgres refuses outright — and would drop the expression if it did not. The same diff also
proposes `DROP DEFAULT` on `student_fee_ledger.discount_amount_minor`, which the same migration set
up in raw SQL.

**So every migration on this schema is hand-written.** Generate it with `--create-only`, delete
everything the diff proposed that you did not intend, keep only your own statement, and apply it
with `migrate deploy`:

```bash
pnpm --filter @gurukulam/db exec prisma migrate dev --create-only --name your_change
$EDITOR prisma/migrations/*_your_change/migration.sql   # keep only what you meant
pnpm --filter @gurukulam/db exec prisma migrate deploy
```

If a migration has already failed halfway, mark it rolled back before re-applying the corrected SQL:
`prisma migrate resolve --rolled-back <migration_name>`.

Check afterwards that the expression survived:

```sql
SELECT column_name, is_generated FROM information_schema.columns
WHERE table_name = 'college_contracts' AND column_name = 'computed_total_minor';
-- is_generated must still be ALWAYS
```

`20260904111720_college_user_revoke_reason` is the worked example: one `ADD COLUMN`, with the two
statements the diff wanted to add stripped out.
