# Notifications & Reporting — analysis

Prepared before implementation. Nothing in the prototype has changed.

Three things are covered: the **notification catalogue**, the **unallocated-students** gap, and a
**report module** designed as a system rather than a list of screens.

---

## Part 1 — Notifications

### 1.1 The distinction that has to be made first

Two different systems are usually conflated under one bell icon, and conflating them is why
notification centres end up ignored:

| | **Console notifications** (the bell) | **Outbound messages** |
| --- | --- | --- |
| Audience | Admin operators | Students, colleges, trainers |
| Channel | In-app, optional email digest | Email · WhatsApp · SMS |
| Purpose | *You need to do something* | *Here is information you need* |
| Success measure | Reaches zero | Delivered and read |
| Failure mode | Ignored because it never empties | Spam complaints |

**The bell is an admin work queue, not a news feed.** If it cannot reach zero, it will be ignored
within a fortnight. That single constraint should drive every decision below.

Much of the outbound side already exists in the prototype — enrolment emails, fee reminders,
reschedule notices, receipts. The bell does not exist yet beyond an icon.

### 1.2 Three notification classes

Everything should be typed as exactly one of these, because they behave differently:

| Class | Behaviour | Example |
| --- | --- | --- |
| **Action required** | Persists until the underlying condition clears. Carries a CTA. Counted in the badge. | 12 certificate names awaiting approval |
| **Alert** | Something broke or is at risk. Persists, escalates if unacknowledged. | Nightly reminder cron failed |
| **FYI** | Auto-reads after viewing. Never badges. Digest-able. | Sunil Menon recorded a ₹21,000 payment |

An **Action required** item must resolve itself when the work is done — approve the certificates and
the notification disappears without anyone dismissing it. Anything that needs manual dismissal is
FYI wearing a costume.

### 1.3 Catalogue

#### Money — the highest-signal category

| # | Trigger | Class | Recipient role |
| --- | --- | --- | --- |
| M1 | Installments went overdue today | Action | Finance, Ops |
| M2 | Reminder dispatch batch completed — N sent, M failed | Alert if failures | Finance |
| M3 | Payment recorded by another operator | FYI | Finance |
| M4 | Reminder undeliverable — bad WhatsApp number or email | Action | Ops |
| M5 | College invoice overdue | Action | Finance |
| M6 | Contract or ledger fully settled | FYI | Finance |
| M7 | Discount above threshold entered (e.g. >20% off standard) | Action — approval | Super Admin |
| M8 | Ledger created with no installment schedule | Action — data gap | Finance |
| M9 | Expected inflow this week vs collected — shortfall | FYI weekly | Finance |
| M10 | Cash payment logged without a receipt reference | Action | Finance |

#### Students

| # | Trigger | Class | Recipient |
| --- | --- | --- | --- |
| S1 | **Student onboarded but not allocated for > 3 days** | Action | Ops |
| S2 | Student progress fell below the at-risk threshold | Action | Academic |
| S3 | Bulk import finished — N accepted, M rejected | Action if M > 0 | Whoever imported |
| S4 | Duplicate email blocked during onboarding | FYI | Onboarder |
| S5 | Credentials issued but never used after 7 days | Action | Ops |
| S6 | Student marked dropped out | FYI | Academic, Finance |
| S7 | Student allocated to a batch that has already ended | Alert | Ops |

#### Colleges

| # | Trigger | Class | Recipient |
| --- | --- | --- | --- |
| C1 | New requirement raised by a college | Action | Ops |
| C2 | Requirement unconfirmed for > 5 days | Action — escalation | Ops Manager |
| C3 | **Certificate names uploaded — awaiting approval** | Action | Academic, Super Admin |
| C4 | Portal invitation unaccepted after 7 days | Action | Ops |
| C5 | College bulk-added N students | FYI | Ops |
| C6 | Contract end date within 30 days — renewal window | Action | Ops Manager |
| C7 | College uploaded a name with no matching student | Action | Academic |

#### Batches, sessions & trainers

| # | Trigger | Class | Recipient |
| --- | --- | --- | --- |
| B1 | Trainer assignment proposed — awaiting their confirmation | Action | Ops |
| B2 | Trainer declined an assignment | Action | Ops |
| B3 | Batch starts in 7 days with no confirmed trainer | Alert | Ops Manager |
| B4 | Session end time passed but not marked complete | Action | Trainer, Ops |
| B5 | Session completed, no recording linked after 2 days | Action | Ops |
| B6 | Trainer double-booked across overlapping sessions | Alert | Ops |
| B7 | Trainer exceeded max weekly hours | Alert | Ops Manager |
| B8 | Declared leave collides with a scheduled session | Alert | Ops |
| B9 | Batch reached seat cap | FYI | Ops |
| B10 | Batch completed — students now certificate-eligible | Action | Academic |
| B11 | Session rescheduled by another operator | FYI | Ops |
| B12 | Sessions scheduled past the batch's projected end date | FYI | Academic |

#### Assignments & content

| # | Trigger | Class | Recipient |
| --- | --- | --- | --- |
| A1 | Assignment due tomorrow, submission rate below 50% | FYI | Trainer, Academic |
| A2 | Assignment past due with N non-submissions | Action | Academic |
| A3 | Course has topics with no sessions scheduled | FYI | Academic |
| A4 | Recording link broken or video removed at source | Alert | Ops |

#### Placement

| # | Trigger | Class | Recipient |
| --- | --- | --- | --- |
| P1 | **Job post published with zero audience match** | Alert | Placement |
| P2 | Job post closing in 3 days | FYI | Placement |
| P3 | Job post expired and auto-closed | FYI | Placement |

#### System & audit

| # | Trigger | Class | Recipient |
| --- | --- | --- | --- |
| Y1 | **Nightly reminder cron did not run** | Alert — critical | Super Admin |
| Y2 | Integration failure — WhatsApp, S3, Zoom, email | Alert | Super Admin |
| Y3 | Account locked after 5 failed logins | Alert | Super Admin |
| Y4 | Role permissions changed | FYI | Super Admin |
| Y5 | New administrator invited / invitation accepted | FYI | Super Admin |
| Y6 | Scheduled report or export ready | FYI | Requester |

**Roughly 45 notification types.** Nobody should receive all of them.

### 1.4 The volume problem, and how to avoid it

This catalogue will produce hundreds of notifications a week at scale. Four rules keep the bell
usable:

1. **Group, never enumerate.** One "18 installments went overdue today" — never 18 rows. The badge
   counts *situations*, not records.
2. **Default by role.** Finance sees money; Academic sees delivery and certificates; Ops sees
   scheduling and intake; Super Admin sees system alerts. A Finance Admin should not see B4.
3. **Scope like every other query.** A Bengaluru sub-admin sees only Bengaluru's notifications. This
   is invariant 11 applied to the bell — and the bell is the easiest place to leak another region's
   data, because nobody thinks of it as a query.
4. **Auto-resolve on condition clear.** Approve the certificates, the item disappears. Manual
   dismissal should be the exception.

Per-user preferences per type per channel are worth building, but the *defaults* matter far more —
almost nobody edits preferences.

### 1.5 Outbound message catalogue

Recipient-facing, mostly existing or specified already:

| Recipient | Message | Trigger |
| --- | --- | --- |
| Student | Welcome + credentials | Allocation |
| Student | Batch schedule | Allocation |
| Student | Session rescheduled | Session change |
| Student | Recording available | Recording linked |
| Student | Assignment published / due tomorrow | Assignment |
| Student | Fee reminder T-3 · overdue notice | Cron |
| Student | Payment receipt (PDF) | Payment recorded |
| Student | Certificate released | Certificate issued (retail) |
| Student | Job posting matching their course | Job published |
| College | Portal invitation + credentials | Access granted |
| College | Requirement confirmed → batch created | Confirmation |
| College | Invoice, reminder, receipt | Contract billing |
| College | Certificates approved and ready | Approval |
| College | Session schedule and changes | Scheduling |
| Trainer | Assignment proposed — confirm or decline | Proposal |
| Trainer | Schedule change | Reschedule |
| Trainer | Payout statement | Period close |

---

## Part 2 — Unallocated students

A student record and an enrolment are different things. Onboarding creates the record; allocation
creates the enrolment, the ledger and the credentials. **Between those two steps a student exists,
has been sold to, and is generating nothing.** That gap is where revenue leaks.

Today the console shows the count (a KPI tile and a filter chip) but gives it no home. It needs one,
in four places:

| Surface | What it does |
| --- | --- |
| `/students/unallocated` | A dedicated list, defaulted to oldest first — the ones rotting longest |
| Dashboard | A KPI tile that is *red* past a threshold, not neutral |
| Bell | S1 — onboarded but unallocated for > 3 days |
| Report | Ageing report: 0–3 days, 4–7, 8–14, 15+ |

The list needs columns the ordinary directory does not: **days since onboarding**, **created by**,
**course discussed**, **quoted value**, **last contact**. And row actions: *Allocate now*, *Log a
follow-up*, *Mark lost* (with a reason — lost-reason data is worth having).

The same gap exists in three other shapes worth catching at the same time:

- Allocated but **no ledger** (retail student enrolled without commercials)
- Ledger created with **no installments**
- Student with credentials **never used**

Together these are a **data-hygiene queue** — arguably a better framing than four separate screens.

---

## Part 3 — Report module

### 3.1 Design it as a system, not a menu

"All permutations" of measures and dimensions is thousands of reports. Enumerating them produces a
menu nobody reads. The way out is to separate the three things that actually vary:

```
REPORT  =  MEASURES  ×  DIMENSIONS  ×  FILTERS  →  rendered as table | chart | export
```

Build the **grammar** once; the catalogue then becomes saved configurations of it, and any report
you did not anticipate is a filter change rather than a ticket.

### 3.2 The dimensions

| Axis | Values |
| --- | --- |
| Time | Day · week · month · term · financial year · custom range · vs previous period |
| Geography | Country · city |
| Segment | Retail · college |
| Institution | College · discipline · passout year |
| Catalogue | Course · category · topic |
| Delivery | Batch · session · mode (online/offline) |
| People | Trainer · student · **admin user** (creator, collector) |
| Money | Payment mode · installment number · billing party |
| Placement | Job posting · employer |

### 3.3 The measures

| Group | Measures |
| --- | --- |
| **Commercial** | Standard value · pitched value · discount amount & % · advance · collected · outstanding · overdue · collection efficiency % · expected inflow · contract value · revenue per batch / per student |
| **Academic** | Enrolments · completions · drop-outs · completion % · progress % · assignment submission % · certificates issued / revoked |
| **Delivery** | Sessions scheduled / delivered / cancelled / rescheduled · recording coverage % · trainer hours · utilisation % · cost per session · curriculum coverage |
| **CRM** | Requirements raised / confirmed / rejected · conversion % · time-to-confirm · pipeline value · portal adoption |
| **Operational** | Records created · payments logged per operator · notification delivery success · data-quality gaps |

### 3.4 The catalogue that actually matters

Twenty-odd reports cover the real questions. Grouped by who asks them:

#### Finance
| Report | The question it answers |
| --- | --- |
| Collections summary | What came in this period, retail vs college? |
| **Outstanding & ageing** | What is owed, and how stale — 0–30 / 31–60 / 61–90 / 90+ |
| Overdue accounts detail | Exactly who to chase, with contact details |
| **Daily collection register** | Cash reconciliation — what was collected, by whom, in what mode |
| Expected inflow forecast | What *should* arrive over the next 30/60/90 days |
| Discount analysis | Who is discounting, how much, on which courses |
| Payment mode mix | UPI vs card vs cash — and the cash-handling exposure |
| Institutional invoice status | Contract-level ageing |
| Batch profitability | Revenue minus trainer cost, per batch |
| Operator collection report | Collections attributed to each admin |

#### Academic & delivery
| Report | The question |
| --- | --- |
| Batch progress | Sessions delivered vs planned, per batch |
| Course completion & drop-out | Which courses lose people, and where |
| Session delivery | Scheduled vs delivered vs cancelled vs rescheduled |
| **Recording coverage** | Which delivered sessions have no video |
| Assignment submission | Per batch, per session, per student |
| Trainer utilisation | Hours and batches per trainer against capacity |
| Trainer performance | Punctuality, feedback, batches delivered |
| **Trainer payout** | Hours × rate, or per-batch fees — the payroll input |
| Curriculum coverage | Topics planned vs actually taught |

#### Students
| Report | The question |
| --- | --- |
| Student master export | The full register, filtered any way |
| **Unallocated students ageing** | Part 2 above |
| At-risk students | Below progress threshold, with contactability |
| **Enrolment funnel** | Created → allocated → started → completed, with drop at each step |
| Certificates issued | By course, batch, segment, period |
| Acquisition source | Retail vs college, and which operator brought them in |

#### Colleges
| Report | The question |
| --- | --- |
| College account summary | One row per college: students, trainings, value, outstanding |
| **Requirement pipeline & conversion** | Raised → confirmed → delivered, with time-to-confirm |
| College-wise training summary | What we have run for whom |
| Portal adoption | Which colleges actually use their access |
| Certificate approval turnaround | How long approvals sit with us |

#### Operations & audit
| Report | The question |
| --- | --- |
| Admin activity log | Who did what, when |
| **Data quality** | Missing WhatsApp numbers, ledgers without schedules, students without batches |
| Notification delivery | What was sent, what bounced |

#### Placement
| Report | The question |
| --- | --- |
| Job posting performance | Reach and views per posting |
| Placement-eligible pool | Students by course and passout year |

### 3.5 Mechanics every report needs

- **Scope applied server-side** from the principal. A report is the single easiest place to leak
  another region's or another college's data, because it feels like "just numbers".
- Date range with a **comparison period**.
- **Drill-down**: summary → detail rows → the actual record. A number you cannot click is a dead end.
- **Export** CSV and PDF; **schedule** by email (daily/weekly/monthly).
- **Saved views** per operator, and shared views per role.
- Money always in minor units internally, formatted once at the edge.

### 3.6 Where it lives

A `Reports` rail entry with a **library** landing page — categories, recently run, saved and
scheduled — rather than a dozen rail children. Category tabs: Financial · Academic · Students ·
Colleges · Operations.

That is one new rail slot. The rail is at nine, so it fits without regrouping.

### 3.7 What to build first

Not all twenty. The four that earn their place immediately:

1. **Outstanding & ageing** — the money question, asked daily
2. **Daily collection register** — cash reconciliation, needed the moment offline payments are real
3. **Unallocated students ageing** — the revenue leak in Part 2
4. **Batch progress** — the delivery question

Then the grammar behind them generalises to the rest.

---

## Open questions

1. **Does the bell need an email digest**, or is in-app enough for a team that lives in the console?
2. **Who approves an above-threshold discount** — and what is the threshold?
3. **Trainer payout**: is it computed here and exported to payroll, or does the report just inform a
   manual process?
4. **Financial year** — April–March, for period grouping and comparisons?
5. **Lost reasons** for unallocated students: a fixed list, or free text?
6. Should reports respect **soft-deleted** records? If a student is deleted, do historical
   collections still count them? (They should — which argues for soft delete throughout.)
