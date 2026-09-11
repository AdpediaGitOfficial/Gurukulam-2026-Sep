# Gurukulam TMS — Admin Portal Build Specification

**One deliverable: the complete admin portal — all 20 screens.** There are no staged releases.
Nothing ships until every module below is done.

The platform has **four** portals, not the three the source documents describe. Admin is built now.
The Trainer Portal (4 screens), Student Portal (5 screens) and **College Portal** follow later.
Decisions taken here that those portals depend on are flagged **[future-portal]**, so they are made
correctly once rather than revisited.

The admin portal must therefore ship everything that *enables* those portals — credential issuance,
college account mapping, session inheritance, the fee ledger — even though their screens do not
exist yet.

Source documents: `Gurukulam_TMS_Comprehensive_System_Architecture_Doc.docx` and
`Gurukulam_TMS_Production_Code_Spec.docx`.

---

## 1. Scope

### 1.1 Two acquisition segments

The source documents model every student as belonging to a partner college. That is wrong: it is one
of two segments, and the other has no college at all.

#### Flow 1 — Retail

A walk-in or caller asks about a course.

1. We quote the **standard catalog price**; they negotiate; a **pitched price** is agreed.
2. We collect an **advance**. The admin enters the **number of installments and a due date and
   amount for each** — the schedule is hand-authored per student, not a template.
3. The student is **allocated to a batch** running under that course, and issued portal credentials.
4. Attendance is marked by the **trainer or an admin**.
5. On completion **the student** receives the certificate.

**There is no college anywhere in this flow.** The student pays, holds the ledger, receives the
reminders and owns the certificate.

#### Flow 2 — College (B2B)

The college is the customer. The students are the beneficiaries, not the counterparty.

1. We create the college, add POCs with designations (HoD, Placement Director…), and map which of
   them get portal accounts.
2. **A requirement is raised** by the college — a course, a cohort size, a preferred mode and window.
3. On **confirmation** of the requirement, an admin **creates a batch dedicated to that college**.
4. An admin **assigns a trainer**, choosing against a **trainer availability calendar**.
5. **The trainer confirms** the assignment, then delivers — travelling to the campus, or online.
6. The college adds its own students into that batch.
7. **The college pays.** Reminders and notifications go to the college, not to its students.
8. On completion **the college** downloads its students' certificates. College students do not.

Consequences that ripple through the schema:

- **`students.college_id` must be nullable.** The spec's DDL has it `NOT NULL REFERENCES colleges`.
  A retail student has no college and never will. The single most important correction here.
- **`batches.college_id` must exist and be nullable.** A college batch is dedicated to one college;
  a retail batch belongs to none. They are not the same pool and must never mix.
- **Billing is at two different levels.** Retail bills a student; college bills an institution
  against a contract. One installment engine has to serve both parents (§3, M8).
- **Notification recipients are segment-dependent** — the student's WhatsApp in flow 1, the
  college's billing contact in flow 2. The reminder engine needs a recipient resolver, not a column.
- **Certificate eligibility is identical; certificate *access* is not.** Issued the same way in both
  flows, downloaded by the student in flow 1 and by the college in flow 2.
- **A requirement is a first-class record**, not a note. It is what a batch is created *from*, and it
  is the join between a sales conversation and a delivery commitment.

### 1.2 The admin portal stands in for the portals that do not exist yet

Trainer, Student and College portals are all deferred — but the operation cannot run with holes
where their actions should be. Every action those portals will perform must **also** be performable
by an admin from day one:

| Action | Eventually | Must also be, now |
| --- | --- | --- |
| Mark attendance | Trainer portal | Admin, per session |
| Confirm a trainer assignment | Trainer portal | Admin, on the trainer's behalf |
| Raise a requirement | College portal | Admin, logging the call or email |
| Add students to a college batch | College portal | Admin |
| Download certificates | College / Student portal | Admin, for anyone |

This is not scaffolding to be thrown away — an operations team needs these overrides permanently.

### 1.3 The 24 admin screens

Section 2.1 of the architecture doc is headed "15 Dedicated Layouts" but enumerates 18. Six more are
added here: college portal access, college requirements, trainer availability calendar,
institutional contracts, certificates, and job announcements. 24 is authoritative.

| # | Screen | Route | Module | Today |
| --- | --- | --- | --- | --- |
| 0.1 | Universal Login | `/login` | M1 | ✗ |
| 2.1 | RBAC Roles & Permissions | `/settings/roles` | M1 | ✗ |
| 2.2 | Admin Directory | `/settings/administrators` | M1 | ✗ |
| 3.1 | Country Master | `/localisation/countries` | M2 | ✓ |
| 3.2 | City Master | `/localisation/cities` | M2 | ✓ |
| 3.3 | Partner Colleges Directory | `/colleges` | M3 | ✗ placeholder |
| 3.4 | College Points of Contact | `/colleges/contacts` | M3 | ✗ |
| 3.5 | College Sessions Hub | `/colleges/sessions` | M3 | ✗ |
| 3.6 | **College Portal Access** | `/colleges/access` | M3 | ✗ new |
| 3.7 | **College Requirements** | `/colleges/requirements` | M3 | ✗ new |
| 4.1 | Course Catalog | `/courses` | M4 | ✗ placeholder |
| 4.2 | Curriculum Builder | `/courses/[id]/curriculum` | M4 | ✗ |
| 5.1 | Trainer Directory | `/trainers` | M5 | ✗ placeholder |
| 5.2 | **Trainer Availability Calendar** | `/trainers/calendar` | M5 | ✗ new |
| 6.1 | Batch Management | `/batches` | M6 | ✗ |
| 6.2 | Session Scheduler & Attendance | `/batches/sessions` | M6 | ✗ |
| 7.1 | Student Onboarding & Profile | `/students`, `/students/onboard` | M7 | ◐ list only |
| 7.2 | Fee & Installment Ledger (retail) | `/fee-ledger` | M8 | ✗ |
| 7.3 | **Institutional Contracts (college)** | `/fee-ledger/contracts` | M8 | ✗ new |
| 8.1 | Media & Recordings Vault | `/media` | M9 | ✗ |
| 9.1 | AI Question Bank Hub | `/question-bank` | M10 | ✗ placeholder |
| 10.1 | **Certificates** | `/certificates` | M12 | ✗ new |
| 11.1 | **Job Announcements** | `/hiring` | M13 | ✗ new |
| 1.0 | Executive Dashboard | `/` | M11 | ◐ mock data |

**Done: 2. Partial: 2. Remaining: 20.**

What already exists is the expensive part — a token layer, 25 UI primitives, 10 composed patterns,
the console chrome, and a proven vertical-slice recipe in `features/countries/` covering list →
filter → paginate → onboard → drawer-edit → archive. M3, M4 and M5 are largely re-runs of that recipe.

---

## 2. Cross-cutting foundations

Not a phase — the substrate every module compiles against. Written first because the modules
literally cannot be written without it, and shared by all of them.

### 2.1 Database

PostgreSQL 15 + Prisma, the full 16-table schema from the spec. Ships with hand-written migration
SQL for the generated column, and a seed covering 2 countries, 4 cities, 6 colleges, 6 courses,
8 trainers, 6 batches with sessions, and 40 students with ledgers in every payment state — enough
to exercise every screen including empty and overdue states.

Each `features/*/server/*-service.ts` remains the only thing that knows the database exists.

### 2.2 The principal and city scoping

`getCurrentUser()` widens from `{ name, role, avatarUrl }` to:

```ts
interface Principal {
  id: string;
  name: string;
  roleId: string;
  roleName: string;
  cityScope: string[] | null;   // null = global
  permissions: Record<string, { read: boolean; edit: boolean; delete: boolean }>;
}
```

Every service function takes the principal and applies `cityScope` itself. This must exist before
any module's queries are written — a regional sub-admin scoped to Bengaluru gets
`WHERE city_id = 'BLR'` on every screen including the dashboard, and bolting that on afterwards
means editing every query function in the codebase.

### 2.3 Money

Integer minor units (paise) or Prisma `Decimal`, chosen up front, with `formatCurrency` /
`parseCurrency` in `lib/format.ts`. Every fee-touching screen depends on it.

### 2.4 Navigation IA

The rail goes one level deep, with a tab strip for modules carrying sub-lists (the Localisation
pattern already in place):

```
Dashboard
Localisation (Countries | Cities)
Colleges     (Directory | Contacts | Requirements | Campus Sessions | Portal Access)
Courses      (Catalog | Curriculum)
Trainers     (Directory | Availability)
Batches      (Batches | Scheduler)
Students     (Directory | Certificates)
Fee Ledger   (Retail | Institutional Contracts)
Content      (Recordings | Question Bank)
Hiring
—
Settings (General | Roles | Administrators) · Account
```

Ten primary entries is the rail's practical ceiling, and 24 screens do not fit in ten slots without
grouping. Three decisions follow from that: RBAC and the admin directory live under Settings;
certificates sit under Students, because a certificate is a student outcome rather than a module;
and the two asset libraries — recordings and the question bank — merge under **Content**, which is
what frees the slot Hiring needs.

### 2.5 Module recipe

Every module follows the shape `features/countries/` established: `types.ts` → `server/service.ts`
→ `server/actions.ts` (validation server-side, so it cannot be bypassed and works pre-hydration) →
components → route. Filters and pagination live in `searchParams`, not client state.

### 2.6 Component gaps

The design kit ships **27 primitives, 10 patterns and 34 icons**, and the exported kit is currently
byte-identical to `src/`. It does not cover everything the remaining modules need. These are
additions to the shared layer, so they are foundations rather than any one module's private work:

| Need | For | Notes |
| --- | --- | --- |
| **DataTable: frozen first column + grouped headers** | M8 | The ledger grid scrolls horizontally through I1/I2/I3, each spanning Amount / Due Date / Status. `DataTable` today is single-header with no column pinning — this is the largest single addition. |
| **DataTable: column sorting** | M3, M5, M7 | Absent today. |
| **Multi-select / combobox** | M5 `skill_tags`, M1 `assigned_cities` | `Select` is a native single-select by deliberate choice. JSONB array fields have no control. `Chip` already exists for display. |
| **File upload / dropzone** | M4 syllabus, M7 CSV import, M8 receipts, M9 media | Nothing exists. |
| **Calendar / month grid** | M6 scheduler | Nothing exists. |
| **Drag-to-reorder list** | M4 curriculum sequencing | Nothing exists; must be a client component. |
| **Toast** | every mutation | `Alert` is static and inline. Server Actions plus redirect covers most flows, but an in-drawer payment save has nowhere to report success. |
| **OTP input** | M1 MFA modal | Nothing exists. |
| **Date picker** | M6, M7, M8 | `Input` passes `type="date"` through to the native control. Recommend staying native, consistent with `Select`'s existing decision — no new component. |
| **Permission matrix** | M1 | Composable from `Checkbox` + `DataTable`. No new primitive. |

Eight new primitives plus two `DataTable` extensions. Build them into `components/ui` — not into a
feature — and re-export the kit at the end of the build so it stays in sync.

**Trap when adding tokens:** a token lives in *two* files, the `@theme` block in `globals.css` **and**
the scale lists in `src/lib/cn.ts`. Registered in only one, it works in isolation and then silently
vanishes the moment it meets another utility of the same prefix — tailwind-merge cannot tell a custom
font size from a custom colour, so it drops the class from the DOM. The source looks correct, which
is why this survives review. See §4 of `docs/reuse-kit.md`.

---

## 3. Modules

### M1 — Access & Identity (screens 0.1, 2.1, 2.2)

Login with MFA modal, email/password, remember-me. Role routing reads `role_id` from the JWT:
`SUPER_ADMIN`/`OPS` → `/`, with `TRAINER` and `STUDENT` destinations wired to stubs
**[future-portal]**. Redis-backed lockout: 5 failures in 15 minutes → 30-minute lock. Refresh token
in a secure HTTP-only cookie, 30-day expiry, when remember-me is set.

Roles screen is the module-level CRUD permission matrix persisted to `roles.module_permissions`
(JSONB). Admin directory covers administrator records and their `assigned_cities` regional scope —
this is what populates `Principal.cityScope`.

Bcrypt or Argon2 for `password_hash`. Only `admin_users` carries credentials; trainer and student
credential storage is unresolved in the spec and must be settled before those portals
**[future-portal]**.

### M2 — Localisation (3.1, 3.2) — built

Countries and cities are complete: list, filter tabs, pagination, onboarding forms, settings
drawer, archive. Remaining work is conforming them to the `Principal` signature once §2.2 lands.

### M3 — Colleges (3.3–3.7)

Partner college directory (`college_code` unique, `partnership_type` of B2B / HUB / PLACEMENT,
country and city FKs), points of contact with designation (HoD, Placement Director, TPO…) and a
single-primary-POC constraint per college, and the campus sessions hub showing institutional
sessions and room allocations. The sessions hub reads `batch_sessions` filtered to the college — a
view over M6's data, not its own table.

**College portal access (3.6) — new.** This is the account-mapping step: choosing which POCs become
portal users, issuing their credentials, and setting what their college can do. A college user is
scoped to a single `college_id` and can only ever see students carrying it. Admin can grant, revoke,
reset and audit these accounts.

The college portal itself is **[future-portal]**, but everything it authenticates against is built
here. The `Principal` from §2.2 gains a `collegeScope` alongside `cityScope`, so college users are
the same authorisation concept as regional sub-admins rather than a parallel mechanism bolted on
later.

**College requirements (3.7) — new.** The demand record that starts flow 2: college, course,
expected headcount, preferred delivery mode, preferred window, notes. Status runs
`NEW → UNDER_REVIEW → CONFIRMED → FULFILLED`, with `REJECTED` as a terminal branch. Raised by an
admin today (logging a call or email) and by a college user later **[future-portal]**, so it carries
a `source` field from the start.

**Confirming a requirement is the trigger that creates a batch** (M6), and the requirement holds the
FK to the batch it produced. That link is what makes "what did we promise, and did we deliver it?"
answerable — without it, a confirmed requirement and a running batch are two unrelated rows.

### M4 — Courses & Curriculum (4.1, 4.2)

Course catalog with `standard_market_value` — the figure that auto-fills the fee ledger's standard
column, so its correctness propagates into M8. Lifecycle DRAFT / PUBLISHED / ARCHIVED. Curriculum
builder handles module sequencing, chapter topics, and syllabus PDF upload to S3.

### M5 — Trainers (5.1, 5.2)

Instructor directory with `skill_tags` (JSONB array), qualification, pay model
(HOURLY / MONTHLY_FIXED / PER_BATCH) and rate, `max_weekly_hours` capacity, and status including
ON_LEAVE.

**Trainer availability calendar (5.2) — new.** A week/month grid across trainers showing, per day
and time block: sessions already committed (derived from `batch_sessions`), declared unavailability
(leave, blocked time, held in a new `trainer_availability` table), and remaining capacity against
`max_weekly_hours`.

This is not a reporting view — it is the **assignment surface**. An admin picks a trainer for a
college batch *from* this calendar, filtered by the skill tags the course requires. Building it as a
read-only calendar and bolting assignment on afterwards means building it twice; treat selection as
part of the screen.

Availability is computed, not stored: committed sessions plus declared blocks. Storing a
denormalised free/busy state guarantees it drifts the first time a session moves.

### M6 — Batches & Sessions (6.1, 6.2)

Batch creation mapping course + primary trainer + operating city + delivery mode + dates, with
status SCHEDULED / IN_PROGRESS / COMPLETED / CANCELLED. Bulk session generation under a batch —
date, time window, assigned trainer, and either a meeting join URL (online) or a campus room
(offline). Master calendar view plus attendance logs.

**Two kinds of batch.** `batches.college_id` is nullable: set, the batch is dedicated to one college
and only that college's students may be allocated to it; null, it is a retail batch. Enforce this at
the allocation seam in M7, not in the UI — a shared roster between a paying institution and retail
walk-ins is a commercial problem, not a validation nicety.

**Trainer assignment is a two-step handshake, not a field.** An admin proposes a trainer from the
M5 calendar; the trainer confirms or declines; only a confirmed assignment is committed delivery.
Model it as `batch_trainer_assignments` with status `PROPOSED / CONFIRMED / DECLINED`, a reason on
decline, and timestamps. The trainer portal is **[future-portal]**, so an admin must be able to
record the confirmation on the trainer's behalf (§1.2) — the workflow exists now even though the
trainer's own screen does not.

**Attendance** is marked per session per student, by the trainer or by an admin (§1.2). It is the
completion signal M12 reads.

Guards belong here: trainer double-booking across overlapping sessions, `max_weekly_hours` capacity
from M5, and skill-tag match against the course.

### M7 — Students & Enrolment (7.1 + allocation)

**Two intake paths, one student record.** The onboarding form branches on
`enrolment_channel` — `RETAIL` or `COLLEGE`:

- **Retail:** no college. Country and city are captured directly. Academic fields (degree, passout
  year, score) are optional — a walk-in may be a working professional, not a final-year student.
- **College:** college selected (by an admin) or implicit (when a college user adds their own).
  Country and city derive from the college. Academic fields are required.

Shared: async duplicate-email check on blur, and a required `whatsapp_number` — the reminder channel
for M8. CSV bulk import serves both paths, and is the same code the college portal will call
**[future-portal]**.

**Allocation differs by segment.** Retail allocation creates the student's fee ledger with its
hand-authored installment schedule (M8) and puts them in a retail batch. College allocation puts the
student in **their own college's batch** and creates **no student ledger at all** — the college is
billed under a contract (M8). Allocating a student to a batch belonging to a different college, or a
college student to a retail batch, must be rejected at this seam.

**Credential issuance.** Allocation generates a student username and password and surfaces them for
handover, with `must_reset_password` set. Admin can re-issue and revoke. The portal that consumes
these is **[future-portal]**; credentials are issued now because the retail flow hands them over at
the point of sale.

**Session inheritance engine.** Allocating a student to a batch is one transaction that writes the
`student_batch_mapping` row, fans out session access grants across every session in that batch —
past, present and future — and creates the fee ledger with its installment schedule. This single
write is the data source for the entire student dashboard **[future-portal]**, so it is built
correctly here rather than patched later.

### M8 — Fee & Installment Ledger (7.2)

The commercial core, and the module the docs specify in most detail.

**Two billing levels, one installment engine.**

- **Retail (7.2)** — `student_fee_ledger` exactly as the spec describes: standard value from the
  course master, negotiated pitched value, generated discount, advance, and an installment schedule
  the admin authors by hand (count, amount and due date per installment).
- **College (7.3) — new** — `college_contracts`: the college is invoiced, so the money sits at the
  institution, not the student. A contract carries the college, the requirement and batch it covers,
  the agreed commercial basis, the advance, and its own installment schedule. **College students get
  no individual ledger** — creating empty per-student ledgers for a cohort the college paid for
  produces a permanently wrong balance-pending figure.

`fee_installments` serves both parents: nullable `ledger_id`, nullable `contract_id`, and a CHECK
that exactly one is set. One schedule engine, one payment drawer, one overdue state machine, one
cron — two parents. The alternative, duplicating the installment table per segment, duplicates the
recalculation bug surface too.

**Reminder recipients resolve by segment.** Flow 1 notifies the student's `whatsapp_number`; flow 2
notifies the college's billing POC. The cron resolves the recipient from the installment's parent
rather than reading a fixed column — a college's students must never receive a payment reminder for
an invoice they are not party to.

Spreadsheet grid: month, student, course, standard catalog value, pitched value, advance and its
date, dynamic installment columns (I1/I2/I3… each with amount, due date, status), total paid,
balance pending, row actions. KPI bar for total pitched, total collected, pending balance, overdue
count. Filters for month and payment status. CSV export.

Log Payment drawer: installment select, amount, date, mode (CASH / UPI / NEFT / CHEQUE), reference
number — required for UPI and NEFT, optional for cash — and receipt attachment.

Business logic:
- **Overpayment guard** — reject an amount exceeding the installment's remaining due.
- **Transactional recalculation** — `total_paid = advance + Σ(installments paid)`;
  `balance = pitched_value − total_paid`. One transaction, never two writes.
- **Status machine** — `total_paid == pitched_value` → `PAID_FULL`; any pending installment past
  its due date → `OVERDUE`.
- **Reminder cron** — nightly 00:01. T-3 days before due sends a WhatsApp reminder and sets
  `reminder_sent_flag`; past due flips `PENDING` → `OVERDUE` and dispatches an overdue notice.

Test the recalculation engine directly. It is the only place in the system where a bug costs money.

### M9 — Media & Recordings Vault (8.1)

S3 and Zoom webhook sync against `batch_sessions`, DRM flag, lecture-notes PDF, publishing status
PROCESSING / UNPUBLISHED / PUBLISHED, and signed CloudFront URL generation. The signed-URL path is
what the student recording player will consume **[future-portal]**.

### M10 — AI Question Bank Hub (9.1)

Category taxonomy by subject, topic and difficulty; MCQ / multi-select / text-code question types;
variant creator; AI generation prompt interface writing `is_ai_generated` records; test rule
templates.

### M11 — Executive Dashboard (1.0)

Real aggregates replacing the mock service. KPIs conformed to spec — Total Students, Active
Trainers, Partner Colleges, Question Bank — **segmented retail vs college**, since the two have
different economics and the blended number hides both — retail revenue is per-student pitched value,
college revenue is contract value. Plus the two analytics panels: course completion rate,
dropout rate, popular-course ranking and revenue pitched-vs-collected; trainer punctuality, batches
per instructor, and feedback ratings. Region-busted cache keys, and empty states for a newly
created region with no data.

Built against finished modules, so its numbers are real rather than approximated twice.

### M12 — Certificates (10.1) — new

Not in either source document. On course completion a certificate is generated for the student, in
**both** segments.

**Eligibility is identical across segments; access is not.** A retail student downloads their own
certificate from the student portal. A **college student never does — the college downloads its
students' certificates** from the college portal. Both are **[future-portal]**; an admin can
download anyone's now (§1.2). Encode this as an access rule keyed on `enrolment_channel`, decided
once here rather than rediscovered when each portal is built.

Admin screens: issuance log (filter by course, batch, college, segment, date), per-batch bulk issue,
single re-issue, and revocation with reason. Template configuration — course name, student name,
duration, dates, signatory, logo — lives under Settings.

Each certificate carries a unique `certificate_number` and a verification code backed by a public
`/verify/[code]` route, so an employer can confirm it independently. This is the whole point of
issuing one; a PDF with no verification path is a decoration. PDFs render server-side and store to
S3 alongside the media vault (M9).

Completion criteria are an open question — see §7. Build the issuance mechanism against an explicit
`isEligibleForCertificate(studentId, batchId)` predicate so the rule can be set without touching the
generator.

### M13 — Hiring & Job Announcements (11.1) — new

Not in either source document. Admin posts jobs; students see the ones aimed at them.

**Scope now: internally authored postings only.** Naukri and other job-board integrations are
explicitly a later stage.

A posting carries the usual commercial fields — role title, company, location, work mode,
experience band, compensation range, skills, description, external application link or email,
closing date — plus a lifecycle of `DRAFT / PUBLISHED / CLOSED / ARCHIVED`. Publishing is the
visibility switch: nothing reaches a student until an admin publishes it.

**Audience targeting.** Visibility is not global — a posting is aimed at students by the course they
opted for, and by the further dimensions that "etc." implies: batch, passout year, segment (retail
or college), specific college, and city. Model this as an audience rule attached to the posting,
with course as the primary axis and the rest optional narrowing filters.

Two design points that are cheap now and expensive later:

- **Resolve the audience at read time, not at publish time.** Materialising "which students can see
  job X" into rows means every student enrolled afterwards silently misses postings that should
  match them, and every batch transfer leaves stale grants. Evaluate the predicate when a student
  asks what they can see.
- **The compose screen needs an audience preview** — a live count and sample of who will see this,
  before publishing. An admin publishing a job blind to its reach will either broadcast to everyone
  or reach nobody, and both are discovered only via complaints.

**Designed for Naukri, not built for it.** The table carries `source` (`INTERNAL` today; `NAUKRI` and
others later) and a nullable `external_ref` and `external_url` from the start. Feeds then arrive as
additional rows through the same audience and visibility machinery, rather than forcing a reshape of
a table that by then holds live data. This is a column and an enum value now — the integration
itself stays out of scope.

The student-facing side is **[future-portal]**. As with every other deferred portal (§1.2), an admin
can see exactly what any given student would see.

---

## 4. Deviations from the spec — decided

The spec was written against a Next 14 / SPA mental model. Several instructions are worse than what
this repo already does. Settled, not open.

| Spec says | We do | Why |
| --- | --- | --- |
| Next.js 14 + Express API layer | **Next.js 16 App Router, Server Components + Server Actions** | Already built this way. No second process to deploy, validation cannot be bypassed, forms work pre-hydration. Per `AGENTS.md`, this Next has breaking changes — read `node_modules/next/dist/docs/` before writing routing code. |
| Shadcn UI / Radix | **Own design system** | Built, documented, rendered live at `/design-system`. Swapping discards finished work. |
| Zustand + React Query | **Server-first; URL as state** | Filters and pagination already live in `searchParams` — deep-linkable and shareable. Client state only where genuinely local, e.g. the payment drawer. |
| `node-cron` in-process | **Route handler + external scheduler** | In-process cron does not survive serverless. `POST /api/v1/cron/fee-reminders` behind a shared secret, driven by Vercel Cron or a GitHub Action. |
| `number` for money | **Integer minor units or `Decimal`** | The spec's fee engine claims "strict decimal handling" then does float arithmetic. The one substantive correctness bug in the spec. |
| Redis throughout | **Redis for M1 lockout only** | Next's cache plus `revalidatePath` covers dashboard caching. |

Adopted as specified: PostgreSQL 15 + Prisma, the 16-table schema, the REST route shapes, JWT with
an embedded permission matrix, S3/CloudFront signed URLs, WhatsApp reminders.

### Schema corrections

- `student_fee_ledger.discount_amount` is `GENERATED ALWAYS AS ... STORED`. Prisma cannot manage
  generated columns — declare read-only in the model, create in hand-written migration SQL.
- **`students.college_id` must become nullable** (§1.1). Retail students have no college. The DDL's
  `NOT NULL REFERENCES colleges(college_id)` makes the retail segment unrepresentable.
- **Add `students.enrolment_channel`** (`RETAIL` | `COLLEGE`) and `created_by_college_id`. Do not
  infer the segment from `college_id IS NULL` — an admin may attach a retail student to a college
  later, and the acquisition channel is a reporting dimension in its own right.
- **Add student credentials** — `password_hash`, `must_reset_password`, `credentials_issued_at`.
  `students` has `account_status` but no way to authenticate. Same omission for `trainers`.
- **New `college_users`** — portal accounts scoped to one `college_id`, with `password_hash`,
  `account_status` and a permission set. Either a new table or credential columns on `college_pocs`;
  prefer the separate table, since not every POC is a portal user and some may be both.
- **New `certificates`** — `certificate_number` (unique), `student_id`, `course_id`, `batch_id`,
  `issued_date`, `issued_by`, `verification_code` (unique), `pdf_url`, and status
  `DRAFT` / `ISSUED` / `REVOKED` with `revoked_reason`.
- **Add `batches.college_id`** (nullable). A college batch is dedicated; a retail batch is open.
- **New `college_requirements`** — `college_id`, `course_id`, `expected_headcount`,
  `preferred_mode`, `preferred_window_start/end`, `source`, `status`
  (`NEW`/`UNDER_REVIEW`/`CONFIRMED`/`REJECTED`/`FULFILLED`), `confirmed_by`, `confirmed_at`, and the
  `batch_id` it produced.
- **New `batch_trainer_assignments`** — `batch_id`, `trainer_id`, status
  (`PROPOSED`/`CONFIRMED`/`DECLINED`), `decline_reason`, timestamps. `batches.primary_trainer_id`
  stays as the confirmed pointer; the handshake lives here.
- **New `trainer_availability`** — declared leave and blocked time. Free/busy is *computed* from
  this plus `batch_sessions`, never stored.
- **New `college_contracts`** — `college_id`, `requirement_id`, `batch_id`, `course_id`, commercial
  basis, `advance_collected_amount`, totals, status. The billing parent for flow 2.
- **`fee_installments` gains a nullable `contract_id`**, `ledger_id` becomes nullable, plus a CHECK
  that exactly one parent is set.
- **Add `student_attendance`** — per session per student, with `marked_by` and `marked_at`. The spec
  names attendance logs but defines no table.
- **New `job_postings`** — role, company, location, mode, experience band, compensation range,
  skills, description, apply link/email, closing date, status
  (`DRAFT`/`PUBLISHED`/`CLOSED`/`ARCHIVED`), `published_at`, `posted_by`, plus `source`
  (`INTERNAL` | `NAUKRI` | …), `external_ref` and `external_url` for the deferred integration.
- **New `job_audience_rules`** — the targeting predicate per posting: course IDs (primary axis) and
  optional narrowing on batch, passout year, segment, college and city. Evaluated at read time;
  never materialised per student.
- `students` has no `country_id` / `city_id`, but the Page 7.1 form collects both. For college
  students derive from `college_id`; for retail students capture directly — so the columns are
  needed either way.
- `payment_status`: the DDL includes `UNPAID`, the architecture doc omits it. Keep `UNPAID`.
- Only `admin_users` has a `password_hash`, yet login routes `TRAINER` and `STUDENT`. Not blocking
  now; must be resolved before those portals. **[future-portal]**

---

## 5. Construction order

Not milestones — just what has to compile before what. Everything below is part of the same
delivery.

```
Foundations (§2) ──► M2 conform
     ├──► M3  Colleges · POCs · portal access · requirements ─┐
     ├──► M4  Courses & Curriculum ─────────────────────────┐ │
     ├──► M5  Trainers + availability calendar ───────────┐ │ │
     ├──► M10 Question Bank                              │ │ │
     ├──► M13 Hiring (course targeting)                  │ │ │
     └──► M1  Access & Identity                          ▼ ▼ ▼
                                                  M6 Batches & Sessions
                                    (retail + college batches · trainer
                                     handshake · attendance)
                                                          │
                                                          ▼
                                              M7 Students & Enrolment
                                               (retail · college paths)
                                                          │
                                ┌─────────────────────────┼────────────────┐
                                ▼                         ▼                ▼
                     M8 Ledger + Contracts        M12 Certificates    M9 Media (M6)
                                └────────────► M11 Dashboard ◄─────────────┘
```

- **Foundations gate everything.** No module's queries can be written before the principal and the
  schema exist.
- **M3, M4, M5, M10 and M1 are mutually independent** — five parallel tracks, the widest point in
  the build. If more than one person or agent is working, this is where they split.
- **M6 needs** courses (M4), trainers *and their availability calendar* (M5), cities (M2), and —
  for college batches — colleges and confirmed requirements (M3).
- **M7 needs** M6. The retail path needs nothing from M3, so build retail first and layer the
  college path on top; that ordering also gets the simpler billing case working first.
- **M8 needs** M7's allocation seam and M4's `standard_market_value`. Build `student_fee_ledger`
  first, then generalise `fee_installments` to a second parent for contracts — not the reverse.
- **M12 needs** M7 plus the attendance signal from M6.
- **M13 needs** only courses (M4) to be authorable, but its audience preview cannot be verified
  until students exist (M7). Build it early, verify it late.
- **M11 is last** — it aggregates over everything, and now segments retail from college.
- **M11 is last** because it aggregates over everything else; building it earlier means computing
  every number twice.

---

## 6. Open questions

**Settled.** The college is billed, not its students. Certificates are issued to every student in
both segments on course completion. Colleges cannot create batches — an admin does, from a confirmed
requirement.

**Still open.** Assumptions are recorded so the build proceeds either way.

1. **What is the commercial basis of a college contract?** A per-student rate times headcount, or a
   flat cohort price? *Assumed:* store both — a rate, a headcount and a computed total, with the
   total overridable. Headcount also drifts between requirement and delivery, so the contract needs
   to record which figure it bills on.
2. **What happens when a trainer declines an assignment?** *Assumed:* the batch returns to
   unassigned, the decline is retained with its reason, and an admin proposes another trainer from
   the calendar. Nothing is auto-reassigned.
3. **Do college students get portal logins at all?** They are excluded from certificate download,
   but presumably still need recordings, schedule and materials. *Assumed:* yes — credentials issued
   as in retail, with certificate access withheld.
4. **What defines course completion?** Attendance threshold, assessment pass, admin sign-off, or a
   combination? *Assumed:* admin sign-off with an attendance floor, behind the
   `isEligibleForCertificate` predicate so the rule can change without touching the generator.
5. **Can a retail batch and a college batch ever share a session?** *Assumed:* no. A college batch is
   dedicated end to end. If joint delivery is ever wanted, sessions need their own roster
   independent of the batch.
6. **Does a college POC need to approve or sign off the requirement** before it becomes a contract,
   or is an admin's confirmation sufficient? *Assumed:* admin confirmation is sufficient; the
   requirement records who confirmed and when.
7. **Do you want to know who applied to a posting?** *Assumed not* — the apply link is external and
   nothing is tracked. If application tracking is wanted, that is an applications table, a status
   pipeline and a student-side action; it should be in scope explicitly rather than by drift.
8. **Should a job be visible only to students who have *completed* the course**, or to anyone
   currently enrolled in it? *Assumed:* enrolled, with completion available as an optional narrowing
   filter on the audience rule.
9. **Do college students see job postings at all**, or is placement the college's own business?
   *Assumed:* yes, with segment available as an audience filter so you can exclude them per posting.

---

## 7. Definition of done

- All 20 admin screens implemented against real Postgres data.
- **A retail student can be onboarded, priced, paid, batched, credentialed and certified without any
  college record existing.** This is the acceptance test for §1.1.
- **A college requirement can be logged, confirmed, turned into a dedicated batch with a trainer
  proposed from the availability calendar and confirmed, staffed with the college's students, billed
  to the college under a contract, and its certificates downloaded by an admin.** This is the
  acceptance test for flow 2, end to end.
- **A college can be created, its POCs mapped, and portal accounts issued and revoked** — the
  college portal's entire server side exists and is testable even though its UI does not.
- **Every action the three deferred portals will perform is performable by an admin** (§1.2):
  attendance marking, trainer confirmation, requirement logging, student addition, certificate
  download.
- Regional sub-admins see only their city scope, and college users only their own college's
  students, on every screen including the dashboard.
- Fee recalculation and the reminder cron covered by direct tests.
- No `ModulePlaceholder` routes remain; no mock arrays in `features/*/server/`.
- `npm run build` and `npm run lint` clean; `/design-system` still renders every primitive in use.
- Payment reminders reach the **student** in retail and the **college** in B2B — never a college's
  student.
- A job posting can be authored, targeted by course, previewed for reach, published, and shown to
  exactly the intended students — verified by an admin viewing as a given student.
- Certificates issue with working public verification, and revocation takes effect immediately.
- The service layer remains the only thing that knows where data comes from.
