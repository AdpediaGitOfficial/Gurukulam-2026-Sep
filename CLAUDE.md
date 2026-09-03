# Gurukulam TMS

Multi-tenant training management system for an EdTech operator running technical courses through
two channels: **retail** walk-ins and **B2B college** engagements.

**This repo is a fresh build.** The product was specified and prototyped in a previous repository;
everything needed to build it is in `docs/`. Read this file, then `docs/architecture.md`, before
writing code.

---

## Read in this order

| Document | What it gives you |
| --- | --- |
| `docs/architecture.md` | Domain model, the 19 invariants, transactional flows, extension contract. **Start here.** |
| `docs/modules.md` | Every module, screen, route, entity and operation |
| `docs/prototype/index.html` | Clickable prototype — 60 routes, all screens. **Open it in a browser.** This is the design reference |
| `docs/admin-portal-plan.md` | Build specification and sequencing |
| `docs/notifications-and-reports.md` | The notification catalogue and report grammar |
| `docs/design-system.md` | UI layer rules |
| `docs/brand-guidelines.md` | Visual language |

---

## What this is, in one pass

**Two acquisition segments, and the difference runs through everything.**

*Retail* — a walk-in negotiates a price, pays an advance, gets a hand-authored installment schedule,
joins a retail batch, and downloads their own certificate.

*College* — the institution raises a requirement, we confirm it and create a **dedicated** batch,
propose a trainer who confirms, the college adds its own students, **the college pays** under a
contract, and **the college** downloads its students' certificates.

**The delivery chain:** `Course → Topic → Batch → Session → (Assignment · Recording)`. A course holds
topics; a topic carries one or more sessions; assignments and recordings hang off the session,
because the session is the unit that actually happens on a given day.

**Four portals, one built.** Admin is in scope. Trainer, Student and College portals come later —
but the admin portal performs every action they will, permanently, because an operations team needs
the override regardless.

---

## Non-negotiables

Full list with enforcement points in `docs/architecture.md` §4. The ones that bite hardest:

1. **`students.college_id` is nullable.** A retail student has no college and never will. The source
   spec had it `NOT NULL`, which makes half the business unrepresentable.
2. **Retail and college rosters never mix.** A student may only join a batch whose `college_id`
   matches their own — both null, or both equal. Enforced at the allocation service.
3. **Billing follows segment.** Retail bills the student; college bills the institution. A college
   student has **no individual ledger**.
4. **One installment engine, two parents.** `fee_installments` has nullable `ledger_id` *and*
   nullable `contract_id`, with a CHECK that exactly one is set.
5. **Money is never a float.** Integer minor units (paise) or `Decimal`, at every layer.
6. **Reminders resolve their recipient from the installment's parent** — never a stored column.
7. **Scope is applied inside the service**, never by the caller. City scope for regional sub-admins,
   college scope for college users — the same mechanism.
8. **Allocation is one transaction:** batch mapping, session access, ledger, credentials. All or none.
9. **Business IDs are generated on save, never typed**, and immutable once issued.
10. **A session must be marked complete before assignments can be set against it.**

---

## Stack

Next.js (App Router) · React · TypeScript strict · Tailwind v4 with a `@theme` token layer ·
PostgreSQL + Prisma · Server Components and Server Actions.

**No client state library and no data-fetching library.** Filters and pagination live in
`searchParams`, so views stay server-rendered and shareable. This is a deliberate departure from the
original spec's Express + Zustand + React Query design; the reasons are recorded in
`docs/admin-portal-plan.md` §4. Do not reintroduce them without reading that first.

### The dependency rule

```
tokens → primitives → patterns → features → routes
```

One-way. A primitive importing from a feature is a bug.

### The data seam

`features/*/server/*-service.ts` is the **only** place that knows where data comes from. Components
consume typed contracts. Preserve this — it is the single most important structural decision here.

### Feature slice shape

```
features/<module>/
├── types.ts                 domain types + query/page/summary contracts
├── server/
│   ├── <module>-service.ts  the ONLY thing that touches data — takes the principal, applies scope
│   └── actions.ts           server actions — validation lives here, returns field-keyed errors
└── components/              domain components
```

---

## Adding a module

1. `types.ts` — entity plus `<X>Query`, `<X>Page`, `<X>Summary`
2. `server/<x>-service.ts` with `import "server-only"` — takes the principal, applies scope
3. `server/actions.ts` — validate server-side, `revalidatePath`, `redirect`
4. A `Column<TRow>[]` descriptor — tables are data, not markup
5. `app/(console)/<module>/page.tsx` — routing only
6. One entry in `config/navigation.ts`
7. **Check the invariants.** If the module touches enrolment, money, scheduling or visibility, at
   least one applies.

**Do not:** reach into another feature's service · put business logic in a route or component · add a
client component to make a filter work · add a raw hex, px size or one-off shadow · add a token to
`globals.css` without also registering it in `lib/cn.ts` (it will silently vanish from the DOM).

---

## Conventions

**Nav rail — nine entries**, ordered as the delivery chain:
`Dashboard · Colleges · Students · Courses · Batches · Trainers · Fee Ledger · Hiring · Reports`,
then Settings and Account. Sessions sit under Batches, assignments under a session. A tenth module
needs a grouping answer, not a new slot.

**Control sizing** — 36px in section headers, 44px in filter toolbars, 48px in forms and page-header
actions. Selects draw their own chevron rather than the native arrow, which cannot be positioned.

**CRUD verbs sit on the row**, not behind a hidden menu.

**Every record carries `created_by`.** A college-created student shows the college user — that is
what makes institutional intake auditable.

---

## Deferred, with re-entry points

| Deferred | Where it lands |
| --- | --- |
| Attendance | `student_attendance` stays in the schema; admin and trainer will write the same row |
| Trainer portal | `batch_trainer_assignments` exists; the portal writes the same rows |
| Student portal | Credentials issued at allocation; session access already granted |
| College portal | `college_users` + `collegeScope` on the principal |
| Naukri feed | `job_postings.source` / `external_ref` / `external_url` already carried |
| Payment gateway | Not used — payments are collected offline and recorded |

---

## Open questions

Recorded in `docs/notifications-and-reports.md` and `docs/admin-portal-plan.md` §6. The two that
change the schema: **the commercial basis of a college contract** (per-student rate × headcount vs
flat cohort price), and **whether reports include soft-deleted records** — if a deleted student's
historical collections still count, that argues for soft delete throughout.
