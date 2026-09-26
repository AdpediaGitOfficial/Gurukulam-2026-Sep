import type { ReportCatalogueEntry } from "@gurukulam/contracts";

/**
 * The report library.
 *
 * Catalogued in full rather than only listing what exists, because the
 * grammar is the deliverable: `MEASURES × DIMENSIONS × FILTERS`. An entry
 * marked SPECIFIED already names its measures and dimensions, so building it
 * is filling in a query rather than redesigning a screen.
 *
 * The four marked BUILT are the ones notifications-and-reports.md §3.7 says
 * earn their place immediately.
 */
export const REPORT_CATALOGUE: ReportCatalogueEntry[] = [
  // ── Money ───────────────────────────────────────────────────────────────
  {
    key: "outstanding",
    title: "Outstanding & ageing",
    description: "What is owed, by whom, and how long it has been owed. The money question, asked daily.",
    group: "Money",
    measures: ["outstanding", "overdue", "billed", "collected"],
    dimensions: ["ageing bucket", "segment", "course", "city", "college"],
    status: "BUILT",
    path: "/reports/outstanding",
  },
  {
    key: "collections",
    title: "Daily collection register",
    description: "Every receipt in the window, for reconciliation against the bank.",
    group: "Money",
    measures: ["collected", "receipt count", "reversals"],
    dimensions: ["date", "payment mode", "segment", "collector"],
    status: "BUILT",
    path: "/reports/collections",
  },
  { key: "discounts", title: "Discount analysis", description: "Pitched price against standard market value, by course and operator.", group: "Money", measures: ["discount", "discount %", "enrolment value"], dimensions: ["course", "operator", "segment", "month"], status: "SPECIFIED", path: null },
  { key: "contract-value", title: "Contract value & realisation", description: "Contracted versus collected per college, and the gap.", group: "Money", measures: ["contracted", "collected", "realisation %"], dimensions: ["college", "course", "commercial basis"], status: "SPECIFIED", path: null },
  { key: "installment-forecast", title: "Installment forecast", description: "What falls due in the coming periods, by parent.", group: "Money", measures: ["due"], dimensions: ["month", "segment", "parent"], status: "SPECIFIED", path: null },
  { key: "payment-modes", title: "Payment mode mix", description: "How money actually arrives, which drives reconciliation effort.", group: "Money", measures: ["collected", "receipt count"], dimensions: ["mode", "month", "city"], status: "SPECIFIED", path: null },
  { key: "reversals", title: "Reversal register", description: "Every reversing entry with its reason — the audit's first question.", group: "Money", measures: ["reversed amount", "count"], dimensions: ["reason", "operator", "month"], status: "SPECIFIED", path: null },

  // ── Enrolment ───────────────────────────────────────────────────────────
  {
    key: "unallocated",
    title: "Unallocated students ageing",
    description: "The gap between a record existing and revenue starting. The revenue leak.",
    group: "Enrolment",
    measures: ["unallocated count", "average age"],
    dimensions: ["ageing bucket", "segment", "city", "onboarded by"],
    status: "BUILT",
    path: "/reports/unallocated",
  },
  { key: "intake", title: "Intake by channel", description: "Retail walk-ins against institutional intake, over time.", group: "Enrolment", measures: ["students"], dimensions: ["segment", "month", "city", "college"], status: "SPECIFIED", path: null },
  { key: "conversion", title: "Onboarding to allocation conversion", description: "How many records become enrolments, and how long it takes.", group: "Enrolment", measures: ["conversion %", "median days"], dimensions: ["segment", "month", "operator"], status: "SPECIFIED", path: null },
  { key: "college-pipeline", title: "College engagement pipeline", description: "Requirements through confirmation, delivery and certification.", group: "Enrolment", measures: ["requirements", "confirmed", "fulfilled"], dimensions: ["college", "status", "month"], status: "SPECIFIED", path: null },
  { key: "roster-changes", title: "Roster movement", description: "Joins and exits per batch, with exit reasons.", group: "Enrolment", measures: ["joined", "left"], dimensions: ["batch", "reason", "month"], status: "SPECIFIED", path: null },
  { key: "credentials", title: "Credential usage", description: "Issued logins never used — a signal that a welcome pack never landed.", group: "Enrolment", measures: ["issued", "unused"], dimensions: ["segment", "month", "college"], status: "SPECIFIED", path: null },

  // ── Delivery ────────────────────────────────────────────────────────────
  {
    key: "batch-progress",
    title: "Batch progress",
    description: "How far each batch has actually got, and what is outstanding on it.",
    group: "Delivery",
    measures: ["progress %", "sessions completed", "recordings missing"],
    dimensions: ["batch", "course", "trainer", "segment", "status"],
    status: "BUILT",
    path: "/reports/batch-progress",
  },
  { key: "trainer-load", title: "Trainer load & utilisation", description: "Committed hours against declared capacity.", group: "Delivery", measures: ["committed hours", "utilisation %"], dimensions: ["trainer", "week", "city"], status: "SPECIFIED", path: null },
  { key: "session-adherence", title: "Schedule adherence", description: "Sessions delivered on their original date, versus rescheduled or cancelled.", group: "Delivery", measures: ["on time %", "rescheduled", "cancelled"], dimensions: ["batch", "trainer", "month"], status: "SPECIFIED", path: null },
  { key: "reschedule-reasons", title: "Reschedule reasons", description: "Why sessions move, which is where the operational fix usually is.", group: "Delivery", measures: ["count"], dimensions: ["reason", "trainer", "month"], status: "SPECIFIED", path: null },
  { key: "recordings", title: "Recording coverage", description: "Completed sessions with and without a linked recording.", group: "Delivery", measures: ["coverage %", "missing"], dimensions: ["batch", "course", "month"], status: "SPECIFIED", path: null },
  { key: "attendance", title: "Attendance summary", description: "Per student and per session. Deferred with attendance itself.", group: "Delivery", measures: ["attendance %"], dimensions: ["batch", "student", "session"], status: "SPECIFIED", path: null },
  { key: "capacity", title: "Capacity utilisation", description: "Seats filled against capacity, by batch and course.", group: "Delivery", measures: ["fill %", "empty seats"], dimensions: ["batch", "course", "city"], status: "SPECIFIED", path: null },
  { key: "trainer-handshake", title: "Trainer assignment latency", description: "How long a proposal waits, and how often it is declined.", group: "Delivery", measures: ["median hours", "decline %"], dimensions: ["trainer", "month"], status: "SPECIFIED", path: null },

  // ── Outcomes ────────────────────────────────────────────────────────────
  { key: "certificates-issued", title: "Certificates issued", description: "Issued, revoked and outstanding, by segment.", group: "Outcomes", measures: ["issued", "revoked"], dimensions: ["segment", "course", "month", "college"], status: "SPECIFIED", path: null },
  { key: "certificate-latency", title: "Certificate turnaround", description: "Submission to release, which is what a college actually feels.", group: "Outcomes", measures: ["median days"], dimensions: ["college", "month"], status: "SPECIFIED", path: null },
  { key: "submission-quality", title: "Submission accuracy", description: "Approved against rejected names per college, with reasons.", group: "Outcomes", measures: ["approved", "rejected", "accuracy %"], dimensions: ["college", "reason"], status: "SPECIFIED", path: null },
  { key: "eligibility-gap", title: "Eligibility shortfall", description: "Students on a completed batch who do not yet qualify, and why.", group: "Outcomes", measures: ["ineligible"], dimensions: ["blocker", "batch", "college"], status: "SPECIFIED", path: null },
  { key: "assignments", title: "Assignment completion", description: "Set against submitted, per batch and session.", group: "Outcomes", measures: ["submission %"], dimensions: ["batch", "session", "student"], status: "SPECIFIED", path: null },
  { key: "verification", title: "Certificate verifications", description: "Public verifier lookups, including failures.", group: "Outcomes", measures: ["lookups", "invalid %"], dimensions: ["month"], status: "SPECIFIED", path: null },

  // ── Placement ───────────────────────────────────────────────────────────
  { key: "job-reach", title: "Posting reach", description: "How many students each posting actually reaches, computed at read time.", group: "Placement", measures: ["reach"], dimensions: ["posting", "course", "segment"], status: "SPECIFIED", path: null },
  { key: "job-pipeline", title: "Posting pipeline", description: "Drafts, published and closed, with time to publish.", group: "Placement", measures: ["count", "median days"], dimensions: ["status", "month", "company"], status: "SPECIFIED", path: null },
  { key: "placement-coverage", title: "Placement coverage", description: "Students reached by at least one live posting, by course.", group: "Placement", measures: ["covered %"], dimensions: ["course", "segment", "passout year"], status: "SPECIFIED", path: null },
  { key: "employer-mix", title: "Employer mix", description: "Which companies post, how often, and for what.", group: "Placement", measures: ["postings"], dimensions: ["company", "role", "month"], status: "SPECIFIED", path: null },
];
