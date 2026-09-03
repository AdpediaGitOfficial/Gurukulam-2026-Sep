# `@gurukulam/db`

The Prisma schema, its migrations, the seed and an invariant check. This package is the **only**
thing in the repo that talks to PostgreSQL; `apps/api` consumes it, and `apps/web` never does.

## Commands

Run from the repo root:

| Command | What it does |
| --- | --- |
| `pnpm db:migrate` | Create and apply a migration (dev) |
| `pnpm db:generate` | Regenerate the Prisma client |
| `pnpm db:seed` | Load seed data — retail and college paths both represented |
| `pnpm db:reset` | Drop, re-migrate and re-seed |
| `pnpm --filter @gurukulam/db verify` | Assert the invariants the database enforces |

## What the schema is shaped by

Read `docs/architecture.md` §3–§4 first. The choices that look unusual are all load-bearing:

- **`students.college_id` is nullable.** The source spec had it `NOT NULL REFERENCES colleges`,
  which makes the retail segment unrepresentable. This is correction #1 and everything else follows
  from it.
- **`batches.college_id` is nullable too.** Set means dedicated to that college; null means an open
  retail batch. The two rosters never mix — enforced at the allocation service, because a CHECK
  cannot reach across from a mapping row to a student's college.
- **Money is `BigInt` paise, never a float**, in every column, suffixed `_minor`.
- **`fee_installments` has two nullable parents** (`ledger_id`, `contract_id`) and a CHECK that
  exactly one is set. One installment engine, one overdue state machine, two billing levels.
- **Every business table soft-deletes** (ADR 0002). `DELETE` is never issued against one.

## Working with the hand-written constraints

Some things Prisma's schema language cannot express, so they live in
`prisma/migrations/20260903075500_constraints/migration.sql`:

- three `GENERATED ALWAYS … STORED` columns — `student_fee_ledger.discount_amount_minor`,
  `college_contracts.computed_total_minor`, `college_contracts.total_value_minor`
- every `CHECK` constraint
- every partial index, including the live-row unique indexes soft delete requires

**Prisma does not know these exist.** Measured behaviour on Prisma 6.19, so you know exactly what to
expect rather than discovering it under time pressure:

| Object | What `prisma migrate dev` does |
| --- | --- |
| CHECK constraints | **Leaves them alone.** Prisma does not manage them at all |
| Partial indexes | **Leaves them alone**, including the partial unique ones |
| Generated columns | **Proposes a spurious `ALTER COLUMN … DROP DEFAULT`** on all three |

That last line is the only one that needs a habit. When a generated migration contains a
`DROP DEFAULT` against one of those three columns, **delete that statement before applying it** —
it is Prisma trying to normalise a column it cannot see the generation clause on.

The failure mode is safe. If you apply it anyway, PostgreSQL refuses:

```
ERROR:  column "discount_amount_minor" of relation "student_fee_ledger" is a generated column
HINT:  Use ALTER TABLE ... ALTER COLUMN ... DROP EXPRESSION instead.
```

The migration aborts and the column keeps its generation clause. It errors loudly rather than
silently reverting — which is why the generated columns stay in `schema.prisma` rather than being
hidden from it. Removing them from the schema would make Prisma propose `DROP COLUMN` instead, and
that one succeeds.

After any migration touching these objects, run the invariant check:

```bash
pnpm --filter @gurukulam/db verify
```

It asserts that the generated columns still compute, and that each CHECK still refuses the write it
exists to refuse. Every passing line names the constraint that did the refusing, so a pass says why
it passed.

## The seed

`prisma/seed.ts` deliberately covers **both** acquisition segments end to end, because a seed that
exercises only one hides the interesting failures:

- **Retail** — Meera Nair (`STU-2026-0891`): no college, her own fee ledger, a four-row hand-authored
  installment schedule, one recorded UPI payment with its transaction ID.
- **College** — Sri Narayana College (`CLG-SNC-01`): a confirmed requirement linked to the dedicated
  batch it produced, a trainer proposed and confirmed, three students on the roster with **no
  individual ledger**, and a `PER_STUDENT` contract carrying the money.
- **Scope** — Arun Menon, a sub-admin scoped to Bengaluru only. Every service query he makes must
  come back filtered; he is the fastest way to catch a service that forgot invariant 11.

All seeded accounts share the dev password `Gurukulam@2026`, hashed with scrypt. Real password
handling arrives with the auth module in Phase 3; nothing here should reach an environment that
matters.

## Known warning

`prisma generate` warns that `package.json#prisma` is deprecated and goes away in Prisma 7. Moving
to `prisma.config.ts` also changes how `.env` is loaded, so it is deliberately deferred rather than
bundled into the schema work — it belongs with the API's configuration setup.
