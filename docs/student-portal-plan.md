# Student portal — what it is, derived from the admin portal

The admin portal performs every action the deferred portals will. That is not a
slogan here: it means the student portal is mostly a **reading** of work the
admin console already does, through a different lens, with two rules that make
it more than a filtered copy.

Read `architecture.md` §4 first. This document assumes the nineteen invariants
and only calls out the ones the portal changes the shape of.

---

## 1. The two things that decide the whole design

### 1.1 A student principal has no scope axis, and that is why nothing leaks today

`PrincipalService.forStudent` returns:

```ts
cityScope: null,      // in this codebase, null means GLOBAL
collegeScope: null,   // likewise
permissions: {},      // ← the only thing keeping them out
```

`null` scope means unrestricted. A student is currently kept out of every
endpoint by having no permissions at all, not by being scoped to themselves.
That fails closed, which is right — but it means the student portal **cannot**
be built the way the college portal was, by handing the same endpoints a
narrower scope.

Two ways forward:

| | What it means | Cost |
| --- | --- | --- |
| **A. A third scope axis** — `selfScope` on the Principal | `/students/:id` and friends gain `...selfScope(principal)` alongside the city and college fragments, and students get a fixed permission matrix | Every admin response mapper now has to be correct for a student reader too |
| **B. A `/me/*` surface** — its own controllers, services and contracts, reading the same tables | `/me/batches`, `/me/assignments`, `/me/fees` … Nothing a student calls is a route an admin calls | One more module; some query logic expressed twice |

**Recommendation: B.** The admin responses carry fields a student must never
see — `notes`, `suspendedReason`, `createdBy`, `createdByCollegeId`, the ledger's
internal columns. Under option A those fields survive in a shared mapper and are
removed by a per-actor projection, and a per-actor projection inside a shared
mapper is precisely how a field escapes: it is one `if` away from being wrong,
and nothing fails when it is. Under option B a student endpoint returns a
student-shaped contract, and a field they should not see never enters the
function.

The duplicated query logic is real and is the price. It is bounded — the reads
are simple, and the *rules* (which batch is mine, which assignment is published)
stay in one service each.

### 1.2 The retail/college split runs through the portal, not around it

Two invariants become visible features rather than internal rules:

**Invariant 3 — billing follows segment.** A college student has no individual
ledger. The Fees section must therefore be **absent** for them, not empty. An
empty Fees page reads as "you owe nothing yet"; the truth is "your institution
is billed and this will never concern you". Same distinction the roll-up made
between a null and a `NONE` portal-access status.

**Invariant 7 — certificate access is asymmetric.** A retail student downloads
their own; a college student earned the identical certificate and **may not
fetch it** — their institution downloads it for them. This is already
implemented server-side: `certificates.service.ts` returns a distinct
`COLLEGE_HOLDS_IT` verdict for exactly this case. The portal must show the
certificate exists, show its verification code, and explain who to ask —
silently hiding it would look like a bug to the student who knows they passed.

---

## 2. What already works, today, with no new server code

Worth knowing before estimating anything:

- **Sign-in as a student.** `POST /auth/login` with `actor: "STUDENT"` accepts
  either the derived login identity (`stu-2026-0891@gurukulam.com`) or the
  person's real address. Lockout, rate limiting and refresh-token rotation all
  apply.
- **Credentials exist already.** Allocation issues them for **both** segments —
  a college student gets a login too — and sets `mustReset`, so the first
  sign-in lands on the change-password screen.
- **The account screen.** `GET /account` already answers for a STUDENT
  principal: name, the address they signed in with, photo, last login, whether a
  reset is pending. `POST /auth/change-password` works.
- **Certificate access**, including the college asymmetry above.
- **Fee reminder notifications** are already written with
  `recipientType: "STUDENT"`, so a student's notification bell has content the
  day it is built.

---

## 3. The feature breakdown

Each admin module, and what it becomes for a student.

### 3.1 Students → **My profile**

| Admin does | Student gets |
| --- | --- |
| Creates, edits, suspends, soft-deletes a student; sets college, channel, city | Reads their own record. Edits a **narrow** set: phone, alternate phone, address lines, postal code, photo |

Not editable, and each for a reason worth showing as a locked field rather than
hiding:

- **Name** — it is printed on the certificate. A student who could change it
  after issue could change what the certificate attests.
- **Email** — invariant 6 resolves a fee reminder's recipient through it. Let a
  student edit it and they can redirect their own invoices. Make it a *request*
  an admin actions, or leave it locked in v1.
- **Student code, college, enrolment channel, account status** — identity and
  segment. Changing any of them re-answers questions the rest of the system has
  already answered.

### 3.2 Batches + Sessions → **My learning** (the centre of the portal)

| Admin does | Student gets |
| --- | --- |
| Creates batches, schedules sessions under a course's topics, assigns trainers, marks sessions complete | The batches they are mapped to — active and completed — and each batch's sessions: date, time, mode, trainer, venue or joining link, status |

Reads `student_batch_mapping` (their rows, `deletedAt: null`), then
`batch_sessions` for those batches. Split **upcoming** from **past**: a student's
first question is "when is my next class", and it should be answered above the
fold rather than found in a list.

A completed mapping (`completedAt` set, or `isActive` false with an
`exitReason`) still shows — the batch they finished is how they explain the
certificate they hold.

### 3.3 Sessions → recordings → **Recordings**

| Admin does | Student gets |
| --- | --- |
| Marks a session delivered, then attaches a YouTube link to it | The recording for any session on their batches that is **completed** and whose recording is `isPublished` |

Two gates, both already in the schema: the session's status and the recording's
publish flag. A recording attached to a session that was never marked complete
should not appear — that ordering is invariant 10's shape, and the portal should
not be the place it is first broken.

### 3.4 Assignments → **My assignments**

| Admin does | Student gets |
| --- | --- |
| Creates assignments against a **completed** session, publishes them, grades submissions | Published assignments on their batches. Submits a URL or text. Sees status, marks awarded, and the trainer's feedback |

`assignment_submissions` already carries `studentId`, `fileUrl`, `contentText`,
`marksAwarded`, `feedback`, `gradedAt` — the write side needs no schema work.

**Constraint worth designing around:** S3 is not integrated, so v1 submissions
are a link plus text, which is what the columns model. Do not build an upload
control that has nowhere to put the file.

Only `PUBLISHED` assignments, and closing (`closedAt`) should stop submission
rather than hide the assignment — a student needs to see what they missed.

### 3.5 Attendance → **My attendance**

| Admin does | Student gets |
| --- | --- |
| *Nothing yet* — the admin UI is deferred, but `student_attendance` is in the schema and admin and trainer will write the same row | Per-session presence, and a percentage per batch |

Build the read now and it renders empty until someone writes a row; that is
honest and costs almost nothing. Say "attendance has not been recorded for this
batch" rather than showing 0%.

### 3.6 Fee ledger → **My fees** — retail only

| Admin does | Student gets |
| --- | --- |
| Creates the ledger at allocation, hand-authors the installment schedule, records offline payments, sends reminders | Their installments: amount, due date, status. What has been paid and when. A receipt per payment |

**Absent entirely for a college student** (§1.2). Money is integer minor units
everywhere; the portal renders it and never computes with a float.

No payment gateway exists — payments are collected offline and recorded — so the
portal shows what is due and how to pay, and has no "Pay now" button. A button
that cannot take money is worse than no button.

### 3.7 Certificates → **My certificates**

| Admin does | Student gets |
| --- | --- |
| Checks eligibility, issues, revokes; approves a college's submitted name list | The certificates they hold, with the verification code |

Retail: a download. College: the record and an explanation that the institution
holds the download (§1.2). The public verifier at `/certificates/verify/:code`
already exists and is unauthenticated by design — the portal should show the
student their code so they can hand it to an employer.

### 3.8 Hiring → **Jobs for me**

| Admin does | Student gets |
| --- | --- |
| Posts a job and defines its **audience** — by course, batch, college, city, passout year, segment, completed-only | The postings whose audience they match |

Invariant 10: audience is evaluated at **read** time, never materialised per
student. `hiring.service.ts` already builds `audienceWhere` as a predicate over
students; the portal needs the same predicate asked from the other end — *which
postings match this student* — rather than a second copy of the rules.

**There is no application table.** v1 is: see the posting, follow its external
link. Tracking applications is a schema addition and a decision, not an
oversight — `job_postings` already carries `source`, `external_ref` and
`external_url` for the deferred Naukri feed.

### 3.9 Notifications → **My notifications**

The table already carries `recipientType` / `recipientId`. Fee reminders are
written for students today. A bell that reaches zero, same as the admin's.

### 3.10 Account

Change password; see the address you sign in with and the address we write to,
which are deliberately different. Already served by `/account`.

---

## 4. The nav

Nine entries was right for an operations console. A student needs five:

```
Home · My learning · Assignments · Fees* · Certificates · Jobs
                                                      … Notifications · Account
```

*Fees is absent for a college student — not disabled, not empty. Absent.*

**Home** answers the three questions a student actually opens the portal with:
when is my next session, what is due from me, and is there anything new. It is a
landing page, not a dashboard of metrics — a student has no fleet to survey.

---

## 5. Gaps that need a decision or new code

| Gap | What it blocks | Note |
| --- | --- | --- |
| **`/me` surface vs `selfScope`** | Everything | §1.1. Decide before writing the first endpoint |
| **No password reset for a student** | A student who forgets their password | Only administrators have a reset endpoint today. Either an admin-initiated reset on the student's admin page (cheap, matches the credential pattern already in use) or a real forgot-password flow with emailed tokens — and there is no email integration, so it is the first one |
| **No email integration** | Forgot-password, submission receipts, "your recording is up" | Deferred by design |
| **No file storage** | Assignment uploads, certificate PDFs | v1 submissions are a link plus text |
| **Attendance has no writer** | The attendance view renders empty | Lands with the admin or trainer attendance UI |
| **No job application record** | "Applied" state, admin visibility of interest | Schema addition. Worth deciding alongside the Naukri feed |

---

## 6. Suggested sequence

Each step is usable on its own, which matters: a portal that only becomes useful
at the end cannot be tested by a real student until the end.

1. **Sign in and see yourself.** The `/me` module, the shell, the nav, profile,
   account. Proves the principal, the scope decision and the layout at once.
2. **My learning.** Batches, sessions, upcoming vs past, recordings. This is the
   portal's reason to exist; everything after it is an addition.
3. **Fees, retail only.** The segment split, made visible. Small, and it forces
   the absent-vs-empty question to be answered properly early.
4. **Assignments.** The first place a student *writes*. Submission, status,
   marks, feedback.
5. **Certificates and jobs.** Both mostly exist server-side; both are reads.
6. **Notifications and attendance.** Both render what other parts of the system
   write, so both are best last.

---

## 7. What this deliberately is not

Not a learning-management system. There is no content library, no quiz engine,
no discussion, no progress gamification. The delivery chain is
`Course → Topic → Batch → Session`, and the portal is a window onto a student's
place in it — the sessions they attend, the work they hand in, the money they
owe, and the certificate at the end.

Adding a tenth thing needs the same answer the admin nav needs: where does it
belong in that chain?
