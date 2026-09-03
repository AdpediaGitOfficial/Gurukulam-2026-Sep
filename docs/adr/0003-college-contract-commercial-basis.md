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
