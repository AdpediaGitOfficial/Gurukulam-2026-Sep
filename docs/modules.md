# Module reference

The complete inventory: every module, its screens, the entities it owns, the operations it exposes,
and the rules it must not break. Generated from the working prototype, not from memory.

Companion documents — [`architecture.md`](architecture.md) for the domain model and invariants,
[`admin-portal-plan.md`](admin-portal-plan.md) for build sequencing,
[`notifications-and-reports.md`](notifications-and-reports.md) for those two subsystems,
[`prototype/index.html`](prototype/index.html) for the visual reference (60 routes, open in a browser).

**Portal scope:** Admin only. Trainer, Student and College portals are deferred — but every action
they will perform is performable by an admin today, permanently (§1.2 of the architecture doc).

---

## Navigation

Nine primary rail entries, ordered as the delivery chain rather than alphabetically. Sessions live
under Batches and assignments under a session, because `Course › Batch › Session › Assignment` is a
containment hierarchy, not four peer modules.

```
Dashboard · Colleges · Students · Courses · Batches · Trainers · Fee Ledger · Hiring · Reports
—
Settings (General | Roles | Administrators | Countries | Cities) · Account
```

A tenth module needs a grouping answer, not a new slot. Localisation sits under Settings because it
is set-up-once configuration; certificates under Students because a certificate is a student
outcome; the question bank under Courses because assessment belongs to a course.

---

## 1. Dashboard — `/`

Executive summary. Two KPI rows: the four headline counts (students, trainers, colleges, question
bank), then four **action** tiles rendered in alert colours — unallocated students, overdue
installments, certificates awaiting approval, missing recordings. Course and trainer analytics
panels, operations log.

Segmented retail vs college throughout, because the two have different economics and a blended
number hides both.

## 2. Colleges — `/colleges`

The institutional CRM. A college is an actor, not a directory row: it has users, contracts,
requirements and its own students.

| Screen | Route |
| --- | --- |
| All colleges | `/colleges` |
| Add college | `/colleges/new` |
| College record — Overview | `/colleges/detail` |
| — Account & contacts | `/colleges/detail/contacts` |
| — Trainings | `/colleges/detail/trainings` |
| — Students (by discipline) | `/colleges/detail/students` |
| — Certificates | `/colleges/detail/certificates` |
| — Calendar | `/colleges/detail/calendar` |
| All contacts (cross-college) | `/colleges/contacts` |
| Requirements | `/colleges/requirements` |
| Portal access | `/colleges/access` |

**Entities** `colleges` · `college_pocs` · `college_users` · `college_requirements` ·
`college_contracts` · `certificate_submissions`

**Operations** View all · Add · Open record · Modify · Delete · Grant/revoke portal access ·
Log requirement · Confirm requirement · Approve certificate names

**Key flows**
- Record opens on an engagement pipeline: Requirement → Confirmed → In progress → Completed → Certificates.
- Granting portal access emails the contact their credentials immediately.
- **Certificate approval:** the college POC uploads names; the review table matches each against a
  student ID and shows attendance and assignment completion so eligibility is visible; an admin
  approves per row; only then can the college download. The student never downloads their own.

## 3. Students — `/students`

Retail and college students in one register.

| Screen | Route |
| --- | --- |
| All students | `/students` |
| Add student | `/students/onboard` |
| **Unallocated queue** | `/students/unallocated` |
| Student record — Overview | `/students/detail` |
| — Courses & assignments | `/students/detail/learning` |
| — Fees | `/students/detail/fees` |
| Allocate to batch | `/students/allocate` |
| Certificates | `/students/certificates` |

**Entities** `students` · `student_batch_mapping` · `certificates`

**Operations** View all · Add · Open record · **Suspend** · Delete · Allocate · Issue credentials ·
Mark lost

**Key points**
- `college_id` is **nullable** — a retail student has none and never will.
- Every student carries `created_by`; a college-created student shows the *college user*, which is
  what makes institutional intake auditable.
- Onboarding creates the record only. **Allocation** is where course, batch, price, schedule and
  credentials are decided — a five-step flow, one transaction.
- The **unallocated queue** covers the gap between record and enrolment, aged 0–3 / 4–7 / 8–14 / 15+,
  with three sibling data-hygiene queues (no ledger, no installments, credentials unused).

## 4. Courses — `/courses`

The catalogue and its content hierarchy.

| Screen | Route |
| --- | --- |
| All courses | `/courses` |
| Add / edit course | `/courses/new` · `/courses/edit` |
| Course detail — topics, sessions, videos | `/courses/detail` |
| Question bank | `/courses/question-bank` |

**Entities** `courses` · `course_topics` · `trainer_courses` · `question_bank`

**Operations** View all · Add · Modify · Delete · Add topic · Add session to topic · Attach video

**Key points**
- A course holds **topics**; a topic carries **one or more sessions**.
- `standard_market_value` auto-fills the fee ledger and every contract.
- `trainer_courses` records which trainers are *approved* for the course — free-text skill tags
  cannot answer "who may run this batch?".
- Videos attach at session level and roll up to the topic and the course library.

## 5. Batches — `/batches`

Delivery. Sessions and assignments live inside here.

| Screen | Route |
| --- | --- |
| All batches | `/batches` |
| Add / edit batch | `/batches/new` · `/batches/edit` |
| Batch detail — Sessions | `/batches/detail` |
| — Roster & enrolment | `/batches/detail/roster` |
| — Recordings | `/batches/detail/recordings` |
| Sessions (all) | `/batches/sessions` |
| Add / edit session | `/batches/sessions/new` · `/batches/sessions/edit` |
| Session detail — Overview | `/batches/sessions/detail` |
| — Assignments | `/batches/sessions/detail/assignments` |
| — Recording | `/batches/sessions/detail/recording` |

**Entities** `batches` · `batch_sessions` · `batch_trainer_assignments` · `assignments` ·
`session_recordings` · (`student_attendance` — schema only, UI deferred)

**Operations** Batch: view/add/modify/delete. Session: view/add/modify/delete/**mark complete**.
Assignment: add/modify/delete. Recording: link/replace/unpublish.

**Key points**
- `batches.college_id` nullable — set means dedicated to that college; null means retail.
  **The two rosters never mix**, enforced at the allocation seam.
- Trainer assignment is a **two-step handshake**: an admin proposes from the availability calendar,
  the trainer confirms. Only a confirmed assignment is committed delivery.
- **A session must be marked complete before assignments can be set against it.** Completion is a
  deliberate act, not a date passing; it releases the assignment tab and prompts for the recording.
- Rescheduling notifies students, trainer and — for a college batch — the institution, from the
  same write.
- Adding students to a batch emails them the schedule and credentials.

## 6. Trainers — `/trainers`

| Screen | Route |
| --- | --- |
| All trainers | `/trainers` |
| Add / edit trainer | `/trainers/new` · `/trainers/edit` |
| Availability calendar | `/trainers/calendar` |

**Entities** `trainers` · `trainer_courses` · `trainer_availability` · `batch_trainer_assignments`

**Operations** View all · Add · Modify · Delete · Declare availability · Propose assignment ·
Confirm on behalf

**Key points**
- The calendar is the **assignment surface**, not a report — you pick a trainer from it.
- Free/busy is **computed** from committed sessions plus declared leave. Never stored, or it drifts
  the first time a session moves.
- Guards: double-booking, `max_weekly_hours`, and course approval.

## 7. Fee Ledger — `/fee-ledger`

Two billing levels, one installment engine.

| Screen | Route |
| --- | --- |
| All students (summary) | `/fee-ledger` |
| Student ledger | `/fee-ledger/student` |
| Institutional contracts | `/fee-ledger/contracts` |

**Entities** `student_fee_ledger` · `college_contracts` · `fee_installments` · `payment_transactions`

**Operations** View · Record payment · Email receipt/statement · Export. **No delete** — a receipt
is a financial record; the correction is a reversing entry.

**Key points**
- Retail bills the **student**; college bills the **institution**. A college student has **no
  individual ledger** — empty ones would leave a permanently wrong balance figure.
- `fee_installments` has nullable `ledger_id` *and* nullable `contract_id`, with a CHECK that
  exactly one is set. One schedule engine, one drawer, one overdue state machine, two parents.
- Installment counts vary from 1 to 100, so the master list is a **summary** (course value,
  discount, enrolment value, paid, balance, `n/m` installments) and the schedule lives in the
  student's own ledger.
- Payment capture: mode (UPI · Credit Card · Debit Card · Cash · Other) and **transaction ID,
  required for every mode except cash**, plus date, bank/handle, notes.
- Overpayment is refused at write time, not corrected afterwards.
- Reminders resolve their recipient **from the installment's parent** — a college's students must
  never receive an invoice reminder.

## 8. Hiring — `/hiring`

| Screen | Route |
| --- | --- |
| All job posts | `/hiring` |
| Add / edit job post | `/hiring/new` · `/hiring/edit` |

**Entities** `job_postings` · `job_audience_rules`

**Operations** View all · Add · Modify · Remove · Publish

**Key points**
- Targeting: **course is the primary axis**, narrowed by batch, passout year, segment, college, city.
- Audience is resolved **at read time**, never materialised — otherwise students enrolled later
  silently miss postings and batch transfers leave stale grants.
- The compose screen shows a **live reach preview** before publishing.
- Naukri is designed for, not built: `source` / `external_ref` / `external_url` are carried now so
  the integration later adds rows rather than reshaping a live table.

## 9. Reports — `/reports`

`REPORT = MEASURES × DIMENSIONS × FILTERS → table | chart | export`

| Screen | Route |
| --- | --- |
| Library (31 reports catalogued) | `/reports` |
| Outstanding & ageing | `/reports/outstanding` |
| Collection register | `/reports/collections` |
| Unallocated ageing | `/reports/unallocated` |
| Batch progress | `/reports/batch-progress` |

Four built; the remaining 27 are specified in the library and in
[`notifications-and-reports.md`](notifications-and-reports.md).

Every report: date range with comparison period, **scope applied server-side**, drill-down to the
record, CSV/PDF export, scheduling, saved views. A report is the easiest place to leak another
region's or college's data, because it feels like "just numbers".

## 10. Notifications — `/notifications`

The bell is an **admin work queue, not a news feed**. If it cannot reach zero it will be ignored
within a fortnight, and that constraint drives every decision.

Three classes: **Action required** (persists until the condition clears, carries a CTA, badges),
**Alert** (something broke), **FYI** (auto-reads, never badges). ~45 types catalogued.

Rules: group by situation never by record; default subscriptions by role; scope like any other
query; auto-resolve when the condition clears.

## 11. Settings & Account

| Screen | Route |
| --- | --- |
| General — notifications, integrations | `/settings/general` |
| Roles & permissions matrix | `/settings/roles` |
| Administrators | `/settings/administrators` |
| Countries · Cities | `/localisation/countries` · `/localisation/cities` |
| My account | `/account` |

**Account is photo-only.** Name, email, role and region scope are read-only — letting an operator
edit their own scope would make the permission model advisory. Changed by a Super Admin under
Settings › Administrators.

---

## Conventions that hold everywhere

**Business IDs are generated on save and never typed.** Shown disabled with an "Auto" badge, and
immutable once issued — every session, ledger, certificate and report references them.
`CLG-` `REQ-` `CON-` `CRS-` `BTC-` `TRN-` `STU-` `ASG-` `TXN-` `GK-CERT-`

**CRUD verbs sit on the row**, not behind a hidden menu, so what an operator can do is visible
without hovering.

**Control sizing** — 36px in section headers, 44px in filter toolbars, 48px in forms and page-header
actions. Selects draw their own chevron (12px inset, matching the search icon opposite).

**Scope is applied inside the service**, never by the caller — city scope for regional sub-admins,
college scope for college users. Same mechanism.

**Add and edit share one form**, differing only in prefilled values and the submit verb.
