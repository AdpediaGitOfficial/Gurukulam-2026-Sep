# Trainer portal — architecture and navigation

Scoped deliberately to two questions: **what shape is it**, and **what is in the
nav**. The screen-by-screen breakdown comes after those are settled, because
both answers move it.

Read `architecture.md` §4 and `student-portal-plan.md` §1 first. The student
portal's two design decisions are the reference point — the trainer portal
answers the same two questions differently, and the differences are the whole
of this document.

---

## 1. The trainer portal is not the student portal with different rows

The student portal is a **reading**. Almost everything on it is a view of work
the admin console already did, and the only things a student writes are their
own profile and their own submissions — records that are about them.

A trainer's portal is a **writing** surface, and most of what they write is
about **other people**:

| What a trainer does | What it writes | Who it is about |
| --- | --- | --- |
| Confirm or decline a batch | `batch_trainer_assignments`, and on confirm `batches.primary_trainer_id` plus every unassigned session's trainer | Themselves, and the cohort |
| Declare leave or blocked time | `trainer_availability` | Themselves — but see §2.3 |
| Mark a session delivered | `batch_sessions.status` | The cohort |
| Attach a recording | `session_recordings` | The cohort |
| Mark attendance | `student_attendance` | **Named students** |
| Set an assignment | `assignments` | The cohort |
| Grade a submission | `assignment_submissions.marks_awarded`, `feedback` | **A named student** |

The last two rows are why this cannot be a `/me` surface in the sense the
student portal uses the term. A student's `/me` means "rows where the student id
is mine". A trainer's does not: attendance and grades are rows about *someone
else*, which this trainer is allowed to write only because of a relationship —
they are confirmed on that batch.

---

## 2. The architecture

### 2.1 The scope axis is derived, and it is two hops

`PrincipalService.forTrainer` today returns `permissions: {}` with both scope
axes null, and the code says why in a comment already:

> The trainer portal is deferred. Credentials exist and the actor type resolves,
> but it carries no module permissions until that portal defines them.

Defining them is this document's job. A trainer's scope is neither city nor
college nor self. It is:

```
my batches   = batches where primary_trainer_id = me
             ∪ batches with a live CONFIRMED assignment to me

my sessions  = batch_sessions where trainer_id = me
             ∪ sessions of my batches

my students  = students with a live mapping to one of my batches
```

Three properties of that, each of which has to be decided rather than assumed:

**It is derived, so it changes underneath them.** A trainer released from a
batch (the release path added with in-house trainers) loses the roster at the
moment of release. Their *history* should not vanish — they delivered those
sessions, and the attendance and grades they wrote stay attributable to them —
but their ability to write more must stop. So the scope for **reading history**
and the scope for **writing** are not the same set, and conflating them is the
bug this section exists to prevent.

**The session is more precise than the batch.** `batch_sessions.trainer_id` is
per session, and a batch's primary trainer is not necessarily the trainer of
every session in it — a substitute for one day is a legitimate thing the schema
already models. Attendance and completion should be authorised on the
**session's** trainer, not the batch's. Reading the schedule can be authorised
on the batch.

**Two hops means two checks.** "May this trainer write attendance for this
student?" is: is this session mine, *and* is this student on that session's
batch roster. Neither alone is sufficient — the first alone lets a trainer mark
any student against their own session; the second alone lets any trainer of that
cohort write against a session they did not deliver.

### 2.2 Surface: `/me` for the trainer's own record, a scoped module for the rest

The student portal's answer was a `/me/*` surface, because admin responses carry
fields a student must never see. Half of that applies here and half does not.

**Their own record** — profile, availability, approved courses, engagement —
is genuinely `/me`-shaped, and gets the same treatment: `/me/profile`,
`/me/availability`, `/me/invitations`.

**Everything about a cohort** is not. A trainer reading a batch roster wants
what the admin's roster shows minus the commercial columns; a trainer marking
attendance is writing the same row an admin will write from the deferred admin
attendance screen. Duplicating those as `/me/batches/:id/roster` means two
services that must agree about who is on a roster, and they will drift.

**Recommendation:** a `trainerScope` fragment applied *inside* the existing
services, exactly as `cityScope` and `collegeScope` are — with a fixed
permission matrix for the TRAINER actor — for batches, sessions, attendance and
assignments. Plus a small `/me` module for the things that are genuinely about
the trainer themselves.

That is the opposite recommendation to the student portal's, and the reason is
the write surface: a student never writes a row about somebody else, so
duplicating a read is cheap. A trainer writes attendance and grades that the
admin console writes too, and those must be one code path or they will diverge
on the rules that matter — which sessions accept attendance, what happens when a
grade is entered twice.

The cost is real and must be paid explicitly: **every response mapper reached by
a trainer needs a projection that omits commercial fields.** A batch carries
pricing; a student row carries a ledger. Put the projection at the service
boundary, once per module, and give it a test that fails if a money field
reaches a TRAINER principal.

### 2.3 Availability is not a private calendar

`trainer_availability` looks like a personal setting and is not. Invariant 8
computes free/busy from committed sessions **plus declared leave**, and that
computation is what the admin's trainer picker and clash check read. A trainer
declaring leave therefore **changes what the operations team is allowed to do**.

Two consequences:

- Declaring leave that **collides with a session already confirmed** cannot
  silently succeed. The catalogue already has B8 for exactly this — "declared
  leave collides with a scheduled session" — as an alert to Ops. The portal
  should say so at the point of declaring, and either refuse or raise the
  alert, not quietly create a contradiction.
- Removing leave is as significant as adding it, and both belong in an audit
  trail. `trainer_availability` is soft-deleted, which gives that for free.

### 2.4 Two things a trainer needs have no server side at all

This is the finding that most changes the estimate, and it is the reason the
trainer portal is a larger piece of work than the student portal despite having
fewer screens.

**Attendance has no service, no controller and no endpoint.** The
`student_attendance` table exists, and `eligibility.service.ts` reads it — and
deliberately reports `NOT_EVALUATED` rather than 0% when a batch has no rows,
precisely because nothing writes any. Certificate eligibility has an attendance
floor per course (`courses.attendance_floor_pct`) that today can never be
evaluated. **The trainer portal is where attendance is born**, and it is a write
path built from scratch, not a screen over an existing one.

**Grading has no endpoint either.** `assignment_submissions` carries
`marks_awarded`, `feedback`, `graded_by` and `graded_at`; nothing in the API
writes them. A student's "18 / 20 — clear work, look at broadcasting again" has
nowhere to come from yet.

Both should be built as ordinary module endpoints authorised for both actors —
admin and trainer — rather than as trainer-portal features. The admin console
performs every action the deferred portals will, permanently, and these are two
actions it currently cannot perform either.

### 2.5 Three smaller decisions, each with a wrong default

**Confirming a proposal does not check who is confirming.**
`batches.respondToProposal` finds the open proposal on the batch and updates it;
its authorisation is `@RequirePermission("batches", "edit")`, which is an admin
recording the answer on the trainer's behalf. When a trainer calls it for
themselves the service must additionally assert `proposal.trainerId ===
principal.id`. Nothing does that today because nothing needed to.

**An in-house trainer has no invitations.** Their assignment is created
`CONFIRMED` the moment they are allocated — they are staff, not a counterparty.
So the Invitations screen is a **freelancer's** screen, and for an in-house
trainer it should be absent, in the same way and for the same reason that Fees
is absent for a college student. It is the trainer portal's version of the
segment split.

**A suspended trainer keeps their confirmed batches, and cannot sign in.**
Suspension withdraws a trainer from the pickers without touching live delivery —
"pulling someone off live delivery as a side effect of a status change would
strand those cohorts". But `forTrainer` refuses a non-ACTIVE account at login.
So today a suspended trainer holds live batches and cannot see them. That is a
contradiction to resolve deliberately: either suspension also releases the
batches (it should not), or a suspended trainer signs in to a read-only portal
that shows the schedule and refuses every write, or suspension is not usable
until someone else takes those batches. **Recommendation: read-only sign-in**,
with the suspension reason shown — a trainer who cannot see the sessions they
are still nominally teaching will simply not turn up.

---

## 3. The navigation

### 3.1 Six entries, and what each answers

A trainer opens this to answer a question, not to survey an estate. The rail
reads as the day: what is happening now, what is coming, who it is for.

| Entry | The question it answers |
| --- | --- |
| **Today** | What am I teaching today, where, and what do I have to do about it — mark it delivered, take attendance, attach the recording |
| **Schedule** | What is coming, across weeks. The calendar the admin already has, seen from inside one trainer |
| **Batches** | The cohorts I teach — roster, progress, how far through the course |
| **Work** | Assignments to set, and submissions to grade |
| **Availability** | Declare leave and blocked time. §2.3 — this is a write that changes what Ops can do |
| **Invitations** | Batches proposed to me, to accept or decline. **Freelancers only** (§2.5) |

Then, off the main list: **Updates** and **Account**.

**Why Today is separate from Schedule.** They are different questions, and the
merged version answers neither well: a calendar that opens on the month makes
"am I teaching in twenty minutes, and where" a scroll away, and a day view makes
"am I free on the 23rd" impossible. The console's own batch page has the same
split — sessions upcoming vs delivered.

**Why attendance is not an entry.** Attendance belongs to a session, not to the
trainer. It is reached from the session on Today or Schedule, in the moment it
is taken. A top-level Attendance entry would be a list of sessions with a second
purpose, which is the same list twice.

**Why there is no Students entry.** A trainer's relationship with a student is
through a batch (§2.1). A flat student list would have to answer "which of these
may I write about", and the answer is always "the ones on my rosters" — so the
roster is the honest place to reach them.

### 3.2 On a phone

Five tabs, same limit as the student portal: **Today · Schedule · Batches ·
Work · More**. Availability, Invitations, Updates and Account live under More.
A trainer marking attendance is standing in a room, on a phone, which puts a
harder floor under tap targets than the console's 44px.

---

## 4. The rail is Google green — and it is a light surface

`#34A853`, as asked. One measured consequence, the same one the student portal's
yellow had:

| Text on `#34A853` | Contrast | Verdict |
| --- | --- | --- |
| White `#FFFFFF` | **3.05 : 1** | Fails WCAG AA for 14px nav labels (needs 4.5:1) |
| Ink `#191C1D` | **5.61 : 1** | Passes |
| Deep green-black `#0D2415` | **5.37 : 1** | Passes — reads more intentional than neutral ink on a green ground |

So the trainer rail carries **dark text**, exactly as the student's yellow rail
does. That is not a workaround; it makes the two portals a family — the admin's
rail is dark with light text, and both portal rails are light with dark text.

**If white text on the rail matters more than the exact hex**, the alternative
is to darken the green to about `#2E7D32`, which carries white at 5.1:1. That
stops being Google green, so it is your call rather than mine.

The same three inversions the yellow rail needed will apply: the brandmark tile
(amber on green is no mark), the unread-count badge, and selection — which on a
light rail is the darkest thing in it, not the brightest.

---

## 5. What to settle before building

1. **`trainerScope` inside the shared services, or a duplicated surface?** §2.2
   recommends the former, opposite to the student portal, because of the write
   surface. This decides everything else.
2. **Attendance and grading endpoints** — built for both actors, or trainer
   only? §2.4 recommends both, since the admin console cannot do either today.
3. **The suspended trainer** — read-only sign-in, or locked out? §2.5.
4. **Green with dark text, or a darker green with white text?** §4.

Once 1 and 2 are settled the screen-by-screen breakdown is worth writing; before
that it would be describing screens whose data access is undecided.
