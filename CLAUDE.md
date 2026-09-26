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
| `docs/prototype/student.html` | The student portal, clickable. Same tokens, phone-first shell. Its segment switch shows invariants 3 and 7 as screens rather than prose |
| `docs/prototype/trainer.html` | The trainer portal, clickable. Green rail. Shows the two screens with no server side — attendance and marking — and what an in-house trainer does not have |
| `docs/prototype/check.mjs` | Walks all three prototypes — every route, every segment, both widths — and fails on a dead link, a blank screen or sideways scroll. `CHROME=… node docs/prototype/check.mjs` |
| `docs/deploy-runbook.md` | **How gurukulam.club actually deploys** — the Actions runner, PM2, and the pre-flight for this release |
| `docs/admin-portal-plan.md` | Build specification and sequencing |
| `docs/notifications-and-reports.md` | The notification catalogue and report grammar |
| `docs/student-portal-plan.md` | The student portal, derived from the admin console — features, the two design decisions, and the gaps |
| `docs/trainer-portal-plan.md` | The trainer portal — its scope axis, why it is a write surface, and the nav |
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

**All four portals are built.** Admin is complete. The **student portal** is at `/portal/*` —
sign-in, home, my learning, assignments, certificates, jobs, fees, updates and account. The **trainer
portal** is at `/teach/*` — home, batches, sessions, one session with its register and its marking,
availability, invitations and account. The **college portal** is at `/campus/*` — sign-in, overview,
requirements (and raising one), students (and adding and placing one), schedule, certificates with
submissions, billing and account. The public certificate verifier is at `/verify`. The admin console
performs every action all three portals do, permanently, because an operations team needs the
override regardless.

**The trainer is the first actor that WRITES, and its scope is a relationship rather than a
column.** City and college scope are columns: a row is in scope when its column matches.
`trainerScope` carries the trainer's own id and the services traverse from it — primary trainer of a
batch, or a live CONFIRMED assignment to it. A PROPOSED one is not enough: an invitation is not a
cohort, and a trainer who could read the roster of every batch they were ever offered would be
reading students they never taught.

**Reading and writing are deliberately different sets, and the difference is one clause.** A trainer
released from a batch loses the roster at the moment of release — but they delivered those sessions,
so the attendance and the marks they wrote stay theirs and stay readable. `trainerMayRead` adds one
clause to `trainerMayWrite`: *this session's `trainer_id` is me*. Both live in `common/scope/scope.ts`
and share `batchIsTheirsNow`, because the read gate used to be spelled out inside the attendance
service as "not their session AND not writable" — which made reading depend on the WRITE rule.
Breaking `trainerMayWrite` in a fault-injection run therefore opened a foreign cohort's register too.

**Attendance is two hops, and the second is the one that gets left out.** "May this trainer write
attendance for this student" is *is this session mine* AND *is this student on that session's batch
roster*. The first passing feels like the answer: with only that, a trainer marks any student in the
database against a day that genuinely is theirs. The session is also more precise than the batch — a
substitute for one day is a thing the schema models, so writes authorise on `batch_sessions.trainer_id`
and reads authorise on the batch.

**A register is taken whole, and a class that has not happened has no register.** The whole roster
posts in one call, because a half-taken register is indistinguishable from one where everybody else
was absent — and that distinction decides a certificate, since `eligibility.service.ts` reports
NOT_EVALUATED rather than 0% when a batch has no rows. The gate is the CALENDAR, not completion:
a trainer marks the register while the room is still full, and requiring completion first would
invert the order of the day.

**A SUSPENDED trainer signs in, reads, and writes nothing.** Suspension withdraws them from the
pickers without touching live delivery — pulling somebody off a running cohort as a side effect of a
status change would strand it — so they still HOLD their confirmed batches. Refusing them at login
left them nominally teaching sessions they could not see, which is how a class ends up with nobody in
the room. It is expressed as `TRAINER_READ_ONLY`, the same matrix with every `edit` withdrawn, so
every `@RequirePermission(…, "edit")` refuses them without knowing suspension exists. INACTIVE is
still refused: that account is over, not paused.

**A trainer's permissions are a fixed matrix, and `courses` is absent from it.** There is one kind of
trainer, so storing the matrix would mean a screen to edit it and a way to get it wrong for a set
with one correct value. `feeLedger`, `hiring`, `colleges`, `reports` and `settings` do not appear at
all — absent is stronger than `false`, because `can()` reads a missing module as no. `courses` is
absent too, a deliberate divergence from `trainer-portal-plan.md` §2.2: the only commercial field in
the whole reachable surface is `courses.standardMarketValueMinor`, the course NAME already rides on
every batch, and removing the module beats projecting it because there is then nothing to forget.

**Portal access is an operator's act, and it needed a button.** A trainer record exists long before
there is anything to sign in to — a CV goes on the bench and may never take a batch — so issuing at
creation would give every candidate a live account. `POST /trainers/:id/access` existed for a while
with no screen calling it, which meant all 191 trainers were unreachable by any operator;
`verify:coverage` is what found that. The verb sits on the trainer page and disappears once access
exists, because re-issuing invalidates the password the person is already holding. The temporary
secret is neither returned nor logged: the login address, derived from the immutable trainer code, is
the only thing there is to hand over.

**The college portal is the one built by NARROWING, and that was always the plan.** `collegeScope`
has sat on the principal beside `cityScope` since the first migration precisely so college users
would be "the same authorisation concept as regional sub-admins rather than a parallel mechanism
bolted on later" (`architecture.md` §2.2). Driving it as a real college user confirmed the reads:
1 college of 24, 51 students of 206, 110 batches of 232, every requirement and certificate theirs.
So `/campus` reads `/students`, `/batches`, `/colleges/requirements` and `/certificates` — the
console's own endpoints — and a parallel `/me/college/students` would be a second copy of a filter
that already works, the copy being the one that drifts.

**Scope decides which ROWS; it has nothing to say about which ACTS.** Every row a college portal user
reaches is legitimately their own, so nothing in `collegeScope` could refuse them revoking their
student's certificate. Driving the real API as a real college user found three that answered success:
`POST /certificates/:id/revoke` returned **200**, `POST /students/:id/suspend` returned **200**, and
`POST /students/:id/deallocate` returned **204**. Issuing a certificate got past authorisation
entirely and failed only on a business conflict.

**`assertOursToDecide(principal, act)` is that rule, named once.** The check already existed —
written out by hand as `if (principal.collegeScope !== null) throw forbidden()` in five places in
`requirements.service.ts`, correct in all five, and absent from every act added afterwards. A rule
that must be remembered at each new call site is a rule that will be forgotten at one of them.
Fourteen acts now call it: confirm, decline and close a requirement; issue, revoke, decide and
release a certificate; suspend, reinstate, deallocate, record a roster outcome and delete a student;
grant and withdraw portal access. `act` completes the sentence the college reads, so the refusal says
which decision is not theirs.

**It throws 403 where scope throws 404, and that asymmetry is deliberate.** `assertInScope` hides an
out-of-region row behind a not-found because a 403 would confirm it exists — that IS the leak. Here
the record is the caller's own: they are looking at their requirement, their student, their
certificate. Pretending the row is absent would read as a bug rather than a rule, so the honest
answer is that they may not act.

**A college's dashboard could not be the operator's with a filter.** `GET /dashboard` scopes every
figure derived from a row and echoes the scope it was computed under — and then reports several that
are not row-derived: how many trainers we have (191), the size of the question bank, the whole course
catalogue, the bench-to-stretched utilisation spread, the trainers carrying the most delivery **by
name**, and an operator queue of sessions missing recordings. Scope has nothing to filter those BY.
A projection would strip them once and rot at the next figure somebody adds, so `dashboard` is absent
from `COLLEGE_PERMISSIONS` and the service refuses a college-scoped principal outright — belt for the
matrix, braces for a stored permission row that predates it.

**`courses` is absent too, and a college still gets a catalogue.** The trainer needed none — the
course name rides on every batch they teach. A college has to NAME the course it is asking for, so
`/me/college/courses` returns `CampusCourse`, which has **no field** for
`courses.standardMarketValueMinor`. The price we quote from is not this segment's price; the
negotiated contract is. A type with nowhere to put the number cannot carry it, which a projection one
`if` away from wrong cannot promise.

**Money is the college's here, and it is not in `feeLedger`.** Invariant 3 runs both ways: a college
student has no individual ledger, so Fees is absent from their portal's navigation — and the
INSTITUTION is the payer, so `/campus/billing` is a first-class screen. It reads the CONTRACT and its
installments (invariant 4's other parent), because `fee_ledgers` would return nothing and render as
"you owe nothing", the most expensive empty state in the product. Summed in `bigint` on the server;
`lib/money.ts` holds the conversions both portals share, and "is this installment overdue" is decided
by the API because it is a comparison on money.

**The college's half of invariant 18 is the submission, and only that half.** They say who they
believe has finished; we check each name against its eligibility; RELEASE is what creates the
certificates. A college that could approve its own rows would be the flow with its only check
removed, so `decide` and `release` answer 403 and neither appears in
`features/campus/server/actions.ts`. That file has four acts — raise a requirement, add a student,
place one on a cohort, submit names — and what is absent from it is the security model stated twice:
the API is the protection, and a portal that offers a button the server will refuse teaches the
person in front of it that the product is broken.

**Every college download goes through the access rule, not through `pdfUrl`.** The certificate list
carries the URL and linking to it would work — and would be a SECOND implementation of invariant 7's
asymmetry, agreeing with `certificateAccess` today. `/campus/certificates/[id]/download` asks the API
on every click instead. The suite checks both ends: their own student's file is theirs (200), and a
retail student's is not found (404, never a refusal — a retail student has no college, so saying
"forbidden" would confirm the record exists).

**The student portal reads `/me/*`, never the admin endpoints.** A student principal carries
`permissions: {}` and null scopes, so it could not be built by narrowing scope the way the college
portal will be. `/me` is its own controller, service and contracts: a field a student must not see
never enters the function, instead of being removed again by a projection that is one `if` away from
being wrong. Its routes gate with `@RequireActor("STUDENT")`, not a permission.

**The student portal has its own visual language; the console is unchanged.** The console keeps the
terracotta rail `brand-guidelines.md` calls structural — icon-first, 80px, nine modules. A portal is
a different product for a different person: a light sidebar the colour of a card, labels beside every
icon, and colour spent on one thing — the active entry, in `accent` with `on-accent` ink. Page titles
are `text-metric` rather than `text-h1`, because a portal screen holds one thing and a console screen
holds nine. Same tokens either way; what differs is which of them each surface spends. The portal's
own grammar lives in `features/me/components/portal-page.tsx` — never edit a console pattern to suit
it.

**Absent, not empty — invariant 3 as a screen.** A college student has no individual ledger, so Fees
is absent from their navigation rather than present and showing zero: an empty Fees page reads as
"you owe nothing yet", when the truth is it will never be theirs to owe. Typing the URL still
answers, with the sentence their situation needs. The nav is built per segment in `student-shell.tsx`
and `verify:portal` signs in as both.

**Money never leaves `bigint` until it is words.** Every amount crosses the wire as a decimal string
of paise. `features/me/money.ts` is the portal's only conversion, and nothing in the portal adds,
subtracts or compares money — the API sums in `bigint`, the screen formats.

**A student writes in exactly one place, and it is scoped by a join.** Handing work in is the only
`/me` route that takes an `:id`, because an assignment belongs to a batch rather than to a student.
The id is never trusted: `submitAssignment` matches it against the caller's own batch mappings inside
the same query, so an assignment they are not on reads as *not found* rather than as a refusal —
there is no authorisation step a later handler can forget. A DRAFT assignment is withheld for the
same reason; a CLOSED one is shown, because closing stops submission and does not erase what was
asked.

**Invariant 7 is a function, and the portal calls it rather than restating it.** Eligibility is
identical across segments; ACCESS is not. `certificateAccess` in `certificates.service.ts` decides,
and `/me/certificates` asks it per row — a second copy of that asymmetry is how the two drift, with
the admin download still refusing a college student while the portal quietly hands them a link. The
record, the number and the verification code are the student's in both segments; only the file is
the college's. `heldByCollege` and `downloadUrl` are separate fields because three states are real —
a link, "your college holds it", and "there is no file yet" — and collapsing the last two sends a
student to argue with an office that was never given anything.

**`/verify` is the one part of this product with no sign-in.** It lives in the `(public)` route
group, which exists so that being public is a decision somebody made rather than a guard they forgot
— every other layout here calls `requirePrincipal` or `requireStudent`. A certificate whose only
readers are the people who issued it is not verifiable, which is the whole point of issuing one. The
API's route was already `@Public`; a code we do not hold and one belonging to a certificate that was
never ISSUED answer identically, because confirming that a name sits behind an unissued code
discloses a record nobody awarded.

**The job audience is evaluated at read time, from both ends, and the two ends are checked against
each other.** `hiring.service.ts` asks which STUDENTS a posting's rules reach; `/me/jobs` asks which
POSTINGS reach a student. Neither materialises a grant (invariant 10) — a join table would silently
miss a student who enrolled this morning and would keep a grant for one moved between batches. But
an inversion is the same semantics written backwards, and backwards is where two implementations
drift without anything failing, so `verify:portal` builds one probe posting per audience axis aimed
at the student under test, with the answer known from that student's own record, and checks three
links: the suite's reference predicate against the service's own published `reach`, the feed against
that reference, and every axis against its expectation. The truth table is not optional — breaking
the inverse's `completedOnly` branch left the first two green, because no seeded posting targeted an
unfinished student's course with it.

**Two mechanisms are called "a notification", and mixing them destroys one of them.** `sweep()`
evaluates SITUATIONS — "how many students are unallocated" — groups them by `groupKey`, and RESOLVES
a row when its count reaches zero. `emit()` writes an EVENT for one person at the moment it happened,
from inside the transaction that made the change, and never resolves. "Your Tuesday session was
cancelled" cannot be swept for: by the time the nightly run happens the row just says CANCELLED, and
nothing records that it changed or that this student has not been told.

**An emitted row must never carry a `groupKey`.** The sweep resolves BY group key, so a borrowed one
means the next nightly run silently deletes the notice and nobody ever knows. `EmittedEvent` simply
has no such field — unwritable rather than discouraged. The two student rows that ARE swept
(`session.tomorrow`, `assignment.due_tomorrow`) do carry one, keyed per student per subject, because
handing the work in is exactly what should clear it.

**Three rules the session emissions exist to obey**, all of them found the hard way in the source
spec: a backdated session notifies nobody, because backfilling a cohort's history would fire twenty
notices at every student about classes they already sat; a bulk upload emits ONE notice rather than
one per session; and an edit emits only when something a student plans around actually moved, because
`update` is also how a venue typo is corrected and "your session was updated" is the noise that
teaches people to stop reading the bell.

**The reminder ladder lives in `fee_installment_reminders`, not in a boolean.** A flag can only say
that something was sent. The unique key on `(installment, offset)` is what makes the nightly run
idempotent — running it twice cannot double-send — and it answers the question finance actually asks.
The run climbs ONE rung, the latest reached: sending every rung an installment has passed produced
9,968 reminders on its first run against real data, and told people "due in five days" about a bill
due in three. Recipients resolve from the installment's parent every time (invariant 6), so a college
student receives nothing.

**Guard a portal page as well as its layout.** Layouts and pages render concurrently, so a layout's
`redirect` does not stop its page calling `/me/*` with the wrong actor's token — the refusal wins the
race and a correct redirect surfaces as a 500. `npm run verify:portal` holds a student session and
checks this, the recording's two gates, the draft-and-scope gates on assignments, that a second
hand-in is refused, invariant 7 from both sides, that a withdrawn certificate keeps its number and
loses its code, that every job-audience axis decides the way the student's record says, that no
emitted notice carries a group key, that a student never sees an operator's queue, that no admin-only
field reaches the screen, and that every portal screen fits 390px.

Certificates carry no PDF yet, so two of those checks would be true for the wrong reason: with every
`pdf_url` null, "no download offered" holds whatever the access rule says. The suite puts a URL there
for the length of the check and takes it away again — otherwise the college half of invariant 7 could
be deleted tomorrow and nothing would fail.

**`npm run verify:teach` holds a trainer session**, because the other suites sign in as an
administrator or a student and a `/teach/*` route visited with either is correctly redirected — adding
those routes to their arrays would test the redirect and nothing else. It measures the scope axis
against the same database the admin sees whole, takes a register through the screen and reads the rows
back, proves both attendance hops, proves a released trainer keeps their history and loses the write,
proves a suspended one signs in and writes nothing, issues portal access from the console as an
operator, and walks every trainer screen at 390px.

Two of its checks needed the condition MANUFACTURED to mean anything, and both are the same shape as
the certificate PDF. Every batch the seeded trainer holds carries one active student, and on a roster
of one "the service writes the whole register" is true whatever the service does — so the suite
borrows a second student of the same segment for the length of the check and hands them back. And the
probe for "a student who is not on the roster is refused" picks a stranger with NO existing row, so
"rows written" means what it says; an absolute count reported the previous run's leftovers as this
run's failure, twice.

**`npm run verify:campus` holds a college session** — 18 checks, driven through the real screens and
endpoints and read back out of the database. It measures the scope axis against what an admin sees
whole, refuses nine acts that are ours and proves nothing was written, checks invariant 7 from both
ends, manufactures another college's student and requirement so "a college cannot see another's" is
not vacuous (every other college in the seed has neither), raises a requirement naming somebody
else's college and checks where it lands, and confirms a revoked account stops on its existing token.

It also drives the FIRST sign-in, because access is issued with `mustReset` set and that screen is
where every real POC starts. Access is re-granted on each run against the same contact address, so
the temporary password is known to that process only and the check is repeatable rather than a
one-shot that passed once.

**A suite that corrupts its own data reports the wrong failure — including when the fault is real.**
The act-gate probe restores what it broke, in the FAILING branch: when those nine acts are refused
there is nothing to undo, and when one goes through it has revoked a real certificate, suspended a
real student and taken them off a real roster. The first injection run left exactly that behind, and
the next run reported "no real row of this college's to probe with" instead of the fault.

**Three checks in this suite were too weak to catch the fault they were written for**, and each was
found by injecting it: `pathname.startsWith("/campus")` is true of `/campus/login`, so the sign-in
assertion read the door and the check after it passed on a session that was never established; a
`pageSize=200` sweep for another college's student passed with the scope filter removed entirely,
because the estate holds 206 students and the probe row was on a page nobody fetched; and posting a
made-up college id was refused as "that college no longer exists" rather than demonstrating the
leak. Searching by the row's own address, waiting on a path that is not the door, and naming a real
other college fixed them.

**Sometimes the injection proves the opposite, and that is worth recording.** Breaking `create` so it
trusts the posted college id did NOT put a student at another institution: the `assertInScope` that
follows refuses it. Two independent enforcement points, so the check asserts the PROPERTY — no
student ever lands at another college — and passes whichever of the two answers.

**A restart that did not restart is worse than no restart.** `pkill -f "apps/api/dist/main.js"` never
matched — the process is `node dist/main.js` with `apps/api` as its cwd — so the "restarted" API went
on serving the previous build, and a fault injection and its restoration read as the same result,
which sent an hour after a product bug that did not exist. Kill by pid, wait for the port, and confirm
`/health` before believing anything a suite says about a change. The same goes for the web app: a
contract field added to `trainerSchema` and an API that was rebuilt but not restarted renders as
"something went wrong" on the one screen that reads it.

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
`globals.css` without also registering it in `lib/cn.ts` (it will silently vanish from the DOM) · put a
wide table in a bare `overflow-x-auto` div — use `TableScroll`, which also contains paint, because
`overflow-x` alone clips what a table *paints* and still lets its width reach the root scroller.

**No screen may drag the page sideways.** `npm run verify:widths` walks every route at 400px, scrolls
it, and fails on any that moves — naming the element responsible. The two causes it catches are a row
of header verbs with no `flex-wrap`, and a flex or grid item without `min-w-0` around something wide.
`Card`, `PageSection` and `PageBody` set `min-w-0` for you; a new container has to.

**One type scale, one role table.** Pick the token by what the text IS, not by how big it should
look: a record's name is `text-body font-semibold`, a value is `text-body`, prose is `text-body-sm`,
a code or timestamp is `text-caption`. The full table is in `docs/design-system.md` §3. **A table
cell is 16px or 12px, never 14px** — 14 is the prose size and prose does not belong in a cell.
`npm run verify:type` reads computed styles on every screen and fails on a size that is off the
scale or wrong for a cell.

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
| Marking a session delivered, setting work, attaching a recording, from `/teach` | The endpoints already authorise a trainer through `assertTrainerMayWrite`; the console owns the screens and `/teach` only reads |
| Bulk student import from `/campus` | `POST /students/import` is the same code the console calls and `collegeScope` already forces the college; the portal adds one at a time |
| A narrower college account | `college_users.permissions` is a JSON column and the principal builder reads it, so `COLLEGE_PERMISSIONS` is what `grant()` writes rather than the only set that can exist |
| Naukri feed | `job_postings.source` / `external_ref` / `external_url` already carried |
| Payment gateway | Not used — payments are collected offline and recorded |

---

## Open questions

Recorded in `docs/notifications-and-reports.md` and `docs/admin-portal-plan.md` §6. The two that
change the schema: **the commercial basis of a college contract** (per-student rate × headcount vs
flat cohort price), and **whether reports include soft-deleted records** — if a deleted student's
historical collections still count, that argues for soft delete throughout.
