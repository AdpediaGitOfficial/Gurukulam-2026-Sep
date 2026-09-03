/**
 * Business IDs — human-facing, distinct from primary keys.
 *
 * They are GENERATED ON SAVE and never typed (architecture.md §8). Two
 * reasons: an operator-typed code collides, and the ID is the record's
 * identity, so every session, ledger, certificate and report points at it.
 * Editing one after issue breaks those references silently.
 *
 * These functions are pure formatters. The caller supplies the sequence
 * number, because only the database can allocate one without racing.
 */

export const ID_PREFIXES = {
  country: "CTRY",
  city: "CITY",
  college: "CLG",
  requirement: "REQ",
  contract: "CON",
  course: "CRS",
  batch: "BTC",
  session: "SES",
  trainer: "TRN",
  student: "STU",
  assignment: "ASG",
  transaction: "TXN",
  certificate: "GK-CERT",
  job: "JOB",
} as const;

/** Uppercase alphanumeric slug of `length` chars, for codes derived from names. */
function slug(source: string, length: number): string {
  const cleaned = source.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length >= length) return cleaned.slice(0, length);
  return cleaned.padEnd(length, "X");
}

/**
 * Initials of a multi-word name, e.g. "Sri Narayana College" → "SNC".
 *
 * Exported because a sequence counter MUST be keyed on the same stem the code
 * is built from. Keying on the full name instead lets two differently-named
 * entities that share initials hold independent counters and then collide on
 * the code itself.
 */
export function codeInitials(source: string, length: number): string {
  const words = source.trim().split(/\s+/).filter(Boolean);
  const letters = words
    .map((w) => w.charAt(0))
    .filter((c) => /[A-Za-z]/.test(c))
    .join("")
    .toUpperCase();
  return letters.length >= length ? letters.slice(0, length) : slug(source, length);
}

const initials = codeInitials;

const pad = (n: number, width: number) => String(n).padStart(width, "0");

/** CITY-BLR · CTRY-IN — from the ISO or city code. */
export const countryCode = (iso2: string) => `${ID_PREFIXES.country}-${iso2.toUpperCase()}`;
export const cityCode = (name: string) => `${ID_PREFIXES.city}-${initials(name, 3)}`;

/** CLG-SNC-01 — college initials plus a running number within that name. */
export const collegeCode = (name: string, sequence: number) =>
  `${ID_PREFIXES.college}-${initials(name, 3)}-${pad(sequence, 2)}`;

/** REQ-2026-014 · CON-2026-007 — year plus sequence. */
export const requirementCode = (year: number, sequence: number) =>
  `${ID_PREFIXES.requirement}-${year}-${pad(sequence, 3)}`;
export const contractCode = (year: number, sequence: number) =>
  `${ID_PREFIXES.contract}-${year}-${pad(sequence, 3)}`;

/** CRS-DA-2026 — course initials plus the year it was introduced. */
export const courseCode = (name: string, year: number) =>
  `${ID_PREFIXES.course}-${initials(name, 2)}-${year}`;

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/**
 * BTC-DA-SEP-A — course, start month, cohort letter. `cohort` is a zero-based
 * index: 0 → A, 1 → B. Past 26 cohorts in one month it doubles up (AA).
 */
export function batchCode(courseName: string, startDate: Date, cohort: number): string {
  const month = MONTHS[startDate.getUTCMonth()] ?? "JAN";
  let letter = "";
  let n = cohort;
  do {
    letter = String.fromCharCode(65 + (n % 26)) + letter;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `${ID_PREFIXES.batch}-${initials(courseName, 2)}-${month}-${letter}`;
}

/** SES-<batch suffix>-01 — sequential within its batch. */
export function sessionCode(batchCodeValue: string, sequence: number): string {
  const suffix = batchCodeValue.replace(/^BTC-/, "");
  return `${ID_PREFIXES.session}-${suffix}-${pad(sequence, 2)}`;
}

/** TRN-0042 · ASG-0142 — a flat running sequence. */
export const trainerCode = (sequence: number) => `${ID_PREFIXES.trainer}-${pad(sequence, 4)}`;
export const assignmentCode = (sequence: number) => `${ID_PREFIXES.assignment}-${pad(sequence, 4)}`;

/** STU-2026-0891 · TXN-00981 — year plus sequence, and a flat sequence. */
export const studentCode = (year: number, sequence: number) =>
  `${ID_PREFIXES.student}-${year}-${pad(sequence, 4)}`;
export const transactionCode = (sequence: number) =>
  `${ID_PREFIXES.transaction}-${pad(sequence, 5)}`;

/** GK-CERT-2026-00418 — year plus sequence. Never reused (ADR 0002). */
export const certificateCode = (year: number, sequence: number) =>
  `${ID_PREFIXES.certificate}-${year}-${pad(sequence, 5)}`;

export const jobCode = (year: number, sequence: number) =>
  `${ID_PREFIXES.job}-${year}-${pad(sequence, 4)}`;

/**
 * Portal LOGIN identities.
 *
 * Derived from the immutable business ID rather than a person's name, which
 * gives three properties worth having:
 *
 *   · unique by construction — the business ID already is, so two students
 *     with the same name cannot collide;
 *   · stable — a marriage, a transfer or a corrected spelling never invalidates
 *     a login;
 *   · recognisable — an operator reading `stu-2026-0891@…` knows exactly which
 *     record it is.
 *
 * These are NOT the contact address. Receipts, invoices and reminders go to
 * the person's real email, which stays untouched — invariant 6 resolves an
 * installment's recipient through it.
 */
export const DEFAULT_PORTAL_DOMAIN = "gurukulam.com";

/** stu-2026-0891@gurukulam.com */
export const studentLoginEmail = (studentCode: string, domain = DEFAULT_PORTAL_DOMAIN) =>
  `${studentCode.toLowerCase()}@${domain}`;

/**
 * snc@gurukulam.com — from the college's code, dropping the CLG- prefix and
 * the running number, so the identity reads as the institution.
 */
export function collegeLoginEmail(collegeCode: string, domain = DEFAULT_PORTAL_DOMAIN): string {
  const stem = collegeCode.replace(/^CLG-/i, "").split("-")[0] ?? collegeCode;
  return `${stem.toLowerCase()}@${domain}`;
}

/** trn-0042@gurukulam.com */
export const trainerLoginEmail = (trainerCode: string, domain = DEFAULT_PORTAL_DOMAIN) =>
  `${trainerCode.toLowerCase()}@${domain}`;
