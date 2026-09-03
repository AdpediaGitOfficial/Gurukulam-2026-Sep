import type { NotificationType } from "@gurukulam/contracts";

/**
 * The notification catalogue.
 *
 * Every entry names what CLEARS it, because that is the property the bell
 * depends on: an ACTION_REQUIRED row that nothing can clear is a row that
 * never leaves, and a queue that cannot reach zero is ignored within a
 * fortnight.
 *
 * LIVE entries are raised and resolved by the sweep. SPECIFIED ones are
 * catalogued with their clearing condition so building them is wiring a query
 * rather than inventing a rule.
 */
export const NOTIFICATION_CATALOGUE: NotificationType[] = [
  // ── Action required: raised by the sweep, cleared by the condition ──────
  { type: "students.unallocated", class: "ACTION_REQUIRED", title: "Students awaiting allocation", description: "Records exist but no course, batch or price has been decided — revenue has not started.", status: "LIVE", clearsWhen: "Every student is on a live roster" },
  { type: "fees.overdue", class: "ACTION_REQUIRED", title: "Installments overdue", description: "Past their due date and still unpaid, across both billing parents.", status: "LIVE", clearsWhen: "No installment is overdue" },
  { type: "certificates.awaiting_approval", class: "ACTION_REQUIRED", title: "Certificate names awaiting review", description: "A college uploaded names; nobody has decided on them yet.", status: "LIVE", clearsWhen: "Every submitted row is approved or rejected" },
  { type: "sessions.missing_recording", class: "ACTION_REQUIRED", title: "Completed sessions without a recording", description: "Completion prompts for the recording; these were never linked.", status: "LIVE", clearsWhen: "Every completed session has a recording" },
  { type: "batches.unassigned", class: "ACTION_REQUIRED", title: "Batches with no confirmed trainer", description: "Scheduled delivery with nobody committed to teach it.", status: "LIVE", clearsWhen: "Every scheduled batch has a confirmed trainer" },
  { type: "trainers.proposal_pending", class: "ACTION_REQUIRED", title: "Trainer proposals awaiting a response", description: "Proposed but neither confirmed nor declined — not yet committed delivery.", status: "LIVE", clearsWhen: "Every proposal is answered" },
  { type: "requirements.awaiting_review", class: "ACTION_REQUIRED", title: "College requirements awaiting review", description: "An institution has asked for training and nobody has responded.", status: "LIVE", clearsWhen: "Every requirement is confirmed or rejected" },
  { type: "ledgers.no_schedule", class: "ACTION_REQUIRED", title: "Ledgers with no installment schedule", description: "A balance exists but nothing will ever fall due against it.", status: "LIVE", clearsWhen: "Every ledger has a schedule" },
  { type: "credentials.unused", class: "ACTION_REQUIRED", title: "Credentials issued but never used", description: "Often means a welcome pack never arrived.", status: "LIVE", clearsWhen: "Every issued credential has been used" },

  // ── Specified: clearing condition named, query not yet wired ────────────
  { type: "students.no_ledger", class: "ACTION_REQUIRED", title: "Retail students on a roster with no ledger", description: "Enrolled but billing never started.", status: "SPECIFIED", clearsWhen: "Every retail enrolment has a ledger" },
  { type: "contracts.unsigned", class: "ACTION_REQUIRED", title: "Active contracts never signed", description: "Delivery is running against an unsigned commercial agreement.", status: "SPECIFIED", clearsWhen: "The contract records a signed date" },
  { type: "batches.overdue_completion", class: "ACTION_REQUIRED", title: "Batches past their end date", description: "Still marked in progress after the scheduled end.", status: "SPECIFIED", clearsWhen: "The batch is completed or cancelled" },
  { type: "certificates.eligible_unissued", class: "ACTION_REQUIRED", title: "Eligible students without a certificate", description: "A completed batch whose students qualify but hold nothing.", status: "SPECIFIED", clearsWhen: "Every eligible student holds a certificate" },
  { type: "jobs.closing_soon", class: "ACTION_REQUIRED", title: "Postings closing within a week", description: "Still published with a closing date approaching.", status: "SPECIFIED", clearsWhen: "The posting is closed or its date passes" },
  { type: "trainers.over_capacity", class: "ACTION_REQUIRED", title: "Trainers past their weekly hours", description: "Committed beyond declared capacity.", status: "SPECIFIED", clearsWhen: "Committed hours fall within capacity" },
  { type: "colleges.no_poc", class: "ACTION_REQUIRED", title: "Colleges with no primary contact", description: "Nobody to send an invoice or a certificate list to.", status: "SPECIFIED", clearsWhen: "A primary contact exists" },
  { type: "sessions.unscheduled_batch", class: "ACTION_REQUIRED", title: "Batches with no sessions scheduled", description: "A cohort with nothing in the diary.", status: "SPECIFIED", clearsWhen: "The batch has at least one session" },

  // ── Alerts: something broke ────────────────────────────────────────────
  { type: "cron.failed", class: "ALERT", title: "The nightly run failed", description: "Reminders and the overdue transition did not complete.", status: "SPECIFIED", clearsWhen: "A subsequent run succeeds" },
  { type: "auth.repeated_lockouts", class: "ALERT", title: "Repeated login lockouts", description: "One account locked several times — either a forgotten password or an attempt.", status: "SPECIFIED", clearsWhen: "No further lockouts in the window" },
  { type: "auth.token_reuse", class: "ALERT", title: "Refresh token reuse detected", description: "A rotated token was presented again, which means a copy leaked.", status: "SPECIFIED", clearsWhen: "Acknowledged by an operator" },
  { type: "payments.reversal_spike", class: "ALERT", title: "Unusual number of reversals", description: "More corrections than the period usually carries.", status: "SPECIFIED", clearsWhen: "The rate returns to normal" },
  { type: "integrations.email_failing", class: "ALERT", title: "Transactional email failing", description: "Welcome packs and receipts are not reaching anyone.", status: "SPECIFIED", clearsWhen: "Delivery resumes" },
  { type: "integrations.storage_failing", class: "ALERT", title: "Document storage unreachable", description: "Certificates and syllabi cannot be written or read.", status: "SPECIFIED", clearsWhen: "Storage responds again" },

  // ── FYI: auto-reads, never badges ──────────────────────────────────────
  { type: "students.enrolled", class: "FYI", title: "A student was allocated", description: "Enrolment completed, credentials issued.", status: "SPECIFIED", clearsWhen: "Read automatically" },
  { type: "payments.received", class: "FYI", title: "A payment was recorded", description: "Money arrived against an installment.", status: "SPECIFIED", clearsWhen: "Read automatically" },
  { type: "certificates.released", class: "FYI", title: "Certificates released to a college", description: "An approved submission became certificates.", status: "SPECIFIED", clearsWhen: "Read automatically" },
  { type: "requirements.confirmed", class: "FYI", title: "A requirement became a batch", description: "Confirmation created the dedicated batch.", status: "SPECIFIED", clearsWhen: "Read automatically" },
  { type: "trainers.confirmed", class: "FYI", title: "A trainer confirmed an assignment", description: "The batch now has committed delivery.", status: "SPECIFIED", clearsWhen: "Read automatically" },
  { type: "sessions.rescheduled", class: "FYI", title: "A session moved", description: "The roster, trainer and institution were told.", status: "SPECIFIED", clearsWhen: "Read automatically" },
  { type: "jobs.published", class: "FYI", title: "A posting went live", description: "Now visible to its audience.", status: "SPECIFIED", clearsWhen: "Read automatically" },
  { type: "access.granted", class: "FYI", title: "Portal access granted", description: "A college contact received their credentials.", status: "SPECIFIED", clearsWhen: "Read automatically" },
];
