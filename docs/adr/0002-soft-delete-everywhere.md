# ADR 0002 — Soft delete, schema-wide

**Status:** Accepted · **Resolves:** `CLAUDE.md` "Open questions" — reports and deleted records

## Context

`admin-portal-plan.md` §6 left open whether reports include soft-deleted records, and noted that if a
deleted student's historical collections still count, that argues for soft delete throughout.

They do count. A payment received in March is a fact about March. Removing the student in June must
not change what was collected in March, or the collection register stops reconciling against the
bank — and `fee_ledger` already carries a no-delete rule for exactly this reason
(`modules.md` §7: "a receipt is a financial record; the correction is a reversing entry").

Applying soft delete to some tables and not others produces the worst outcome: a live
`payment_transactions` row pointing at a hard-deleted `students` row is a dangling reference that
every report has to defend against individually.

## Decision

Every business table carries:

```prisma
deletedAt DateTime? @map("deleted_at")
deletedBy String?   @map("deleted_by") @db.VarChar(36)
```

Rules:

1. **`DELETE` is never issued against a business table.** The delete operation sets `deleted_at` and
   `deleted_by`. This is enforced at the repository layer.
2. **Operational reads exclude soft-deleted rows by default.** Repositories apply
   `deletedAt: null` unless a caller explicitly opts in.
3. **Financial and historical reports include them**, because the events they record still happened.
   A report that opts in shows the record as removed rather than hiding it.
4. **Uniqueness splits in two.**
   - **Login identities** — email addresses on `admin_users`, `college_users`, `trainers` and
     `students`, and role names — get partial unique indexes scoped to live rows
     (`WHERE deleted_at IS NULL`), so an address freed by a deletion can be used again.
   - **Business IDs** — `STU-`, `BTC-`, `GK-CERT-`, `TXN-` and the rest — keep unconditional
     unique constraints and are **never** reused, deleted or not. Receipts, reports and the public
     certificate verifier all point at them; handing an issued number to a second record would
     silently re-target every one of those references.
5. **Restore is an admin action**, not a database repair.
6. **Referential integrity is unaffected** — the row remains, so every FK stays valid, which is the
   property that removes the dangling-reference class of bug entirely.

Join and mapping tables (`student_batch_mapping`, `trainer_courses`, `job_audience_rules`) also
soft-delete: removing a student from a batch must not erase that they were once on its roster, which
is what makes an issued certificate explicable a year later.

## Consequences

- Every query needs the `deleted_at IS NULL` predicate. Centralised in the repository layer so no
  service or controller repeats it; a raw query that skips it is a review-blocking bug.
- Indexes carry `deleted_at` where it affects selectivity.
- Unique constraints become partial indexes, which Prisma cannot express in the schema language —
  they live in hand-written migration SQL alongside the CHECK constraints.
- Hard deletion remains available for genuine data-protection erasure requests, as a deliberate,
  audited operation outside the normal application path.
