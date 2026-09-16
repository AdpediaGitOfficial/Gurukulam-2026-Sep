import { z } from "zod";
import { parseDelimited } from "../batches/session-upload.js";

/**
 * Bulk student import — the format, and the two things an import is not
 * allowed to do.
 *
 * A college hands over a spreadsheet of forty names; a retail desk has a term's
 * walk-ins in a sheet nobody wants to retype. Both want the same thing: get the
 * RECORDS in. So this file creates records and nothing else — the same
 * boundary `POST /students` draws, for the same reason.
 *
 *   · **It never allocates.** No batch, no course, no price, no schedule, no
 *     credentials. Those are decided per student at allocation, in one
 *     transaction (invariant 12), and a spreadsheet cannot express a
 *     hand-authored installment plan. An imported student lands in the
 *     unallocated queue, which is exactly where somebody should look at them.
 *
 *   · **It never moves a student between segments.** A row that names a
 *     different college for a student who already has one is REFUSED, not
 *     applied. Changing a student's college changes who bills them
 *     (invariant 3) and which rosters they may join (invariant 2); it is not
 *     a cell edit.
 *
 * Identity works the way the session upload's does, for the same reason —
 * uploading the same file twice must land on the same students rather than
 * doubling the intake:
 *
 *   · `student_code` names an existing student outright. Blank on a first
 *     import, filled on an export-edit-reimport. Codes are still generated on
 *     save (invariant 9); the column identifies, it never assigns.
 *   · Failing that, **email** identifies — it is unique among live students in
 *     the database, so it is the only column that can carry identity for a
 *     record nobody has a code for yet.
 *
 * Nothing here writes on its own. `dryRun` returns the plan and the console
 * shows it before anything is committed.
 */

/** "YYYY-MM-DD". Parsed strictly: 1998-02-30 is not a birthday. */
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 1998-04-17")
  .refine((v) => {
    const parsed = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v;
  }, "That date does not exist");

/**
 * One row of the file.
 *
 * `rowNumber` is the line it came from, carried through so every rejection can
 * point at the line the operator has open in their spreadsheet.
 */
export const studentImportRowSchema = z.object({
  rowNumber: z.number().int().min(1),
  /** Blank for a new student. Present to update one that already exists. */
  studentCode: z.string().trim().max(32).optional(),
  firstName: z.string().trim().min(1, "Give the student a first name").max(120),
  lastName: z.string().trim().max(120).optional(),
  /** The person's real address — where receipts and reminders go. */
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  phone: z.string().trim().max(24).optional(),
  altPhone: z.string().trim().max(24).optional(),
  dateOfBirth: dateString.optional(),
  gender: z.string().trim().max(24).optional(),
  /** CLG-SNC-01. BLANK MEANS RETAIL, and that is a legitimate answer. */
  collegeCode: z.string().trim().max(32).optional(),
  /** CITY-BLR. Inherited from the college when that is named and this is not. */
  cityCode: z.string().trim().max(16).optional(),
  addressLine1: z.string().trim().max(255).optional(),
  addressLine2: z.string().trim().max(255).optional(),
  postalCode: z.string().trim().max(20).optional(),
  discipline: z.string().trim().max(120).optional(),
  passoutYear: z.number().int().min(1950).max(2100).optional(),
  qualification: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(4000).optional(),
});

export type StudentImportRow = z.infer<typeof studentImportRowSchema>;

export const studentImportSchema = z.object({
  /**
   * The columns the file actually had, normalised.
   *
   * This is the difference between "not stated" and "blank", and it is not a
   * nicety. Without it a file of phone-number corrections — three columns and
   * forty rows — reads every column it does not carry as an instruction to
   * clear that field, and quietly erases everybody's discipline, last name and
   * qualification on its way past.
   *
   * So: a column ABSENT from the header leaves that field alone. A column
   * PRESENT and empty clears it. Both are things an operator means, and only
   * the header can tell them apart.
   */
  columns: z.array(z.string()).min(1, "The file has no header row"),
  /**
   * True returns the plan and writes nothing. The console always asks for the
   * plan first — an import that turns out to have put forty students under the
   * wrong college is not something to discover afterwards.
   */
  dryRun: z.boolean().default(false),
  /**
   * Forces every row under one college, ignoring the file's own column.
   *
   * This is how the college detail screen imports: the operator is already
   * looking at one institution, and a stray `college_code` in row 30 of a
   * handed-over spreadsheet should not quietly enrol somebody elsewhere.
   */
  collegeId: z.string().optional(),
  rows: z
    .array(studentImportRowSchema)
    .min(1, "The file has no student rows")
    .max(500, "Split the file — 500 students is the most one import takes"),
});

export type StudentImportInput = z.infer<typeof studentImportSchema>;

export const importOutcomeSchema = z.enum(["ADD", "UPDATE", "UNCHANGED", "REJECT"]);
export type ImportOutcome = z.infer<typeof importOutcomeSchema>;

/** What the import would do, or did, with one row. */
export const studentImportLineSchema = z.object({
  rowNumber: z.number().int(),
  outcome: importOutcomeSchema,
  /** The student this row lands on — known for UPDATE, and after an ADD commits. */
  studentId: z.string().nullable(),
  studentCode: z.string().nullable(),
  name: z.string(),
  email: z.string(),
  /** Which segment this row lands in — the thing most worth checking in a plan. */
  segment: z.enum(["RETAIL", "COLLEGE"]).nullable(),
  collegeName: z.string().nullable(),
  /** Why it was refused, or what an update would change. Empty for a clean add. */
  detail: z.string().nullable(),
});

export type StudentImportLine = z.infer<typeof studentImportLineSchema>;

export const studentImportResultSchema = z.object({
  /** False when this was a dry run, so the screen can say so plainly. */
  committed: z.boolean(),
  added: z.number().int(),
  updated: z.number().int(),
  unchanged: z.number().int(),
  rejected: z.number().int(),
  /**
   * How many of the added students are unallocated — which is all of them.
   * Stated rather than implied, because "I imported 40 and nothing happened"
   * is the support call this number answers.
   */
  unallocated: z.number().int(),
  lines: z.array(studentImportLineSchema),
});

export type StudentImportResult = z.infer<typeof studentImportResultSchema>;

// ── The file format ───────────────────────────────────────────────────────

/**
 * The columns, in order, as the template writes them.
 *
 * A file is matched on its HEADER rather than on position, so a spreadsheet
 * that reorders columns still loads. Only `first_name` and `email` are
 * required — everything else about a person can be filled in later, but a
 * record with no name and no way to reach them is not a student.
 */
export const STUDENT_IMPORT_COLUMNS = [
  "student_code",
  "first_name",
  "last_name",
  "email",
  "phone",
  "alt_phone",
  "date_of_birth",
  "gender",
  "college_code",
  "city_code",
  "address_line1",
  "address_line2",
  "postal_code",
  "discipline",
  "passout_year",
  "qualification",
  "notes",
] as const;

const REQUIRED_COLUMNS = ["first_name", "email"] as const;

/** A header row plus two worked examples — one retail, one college. */
export const STUDENT_IMPORT_TEMPLATE = [
  STUDENT_IMPORT_COLUMNS.join(","),
  ",Aarti,Rao,aarti.rao@example.com,9845012345,,1999-03-12,F,,CITY-BLR,,,560001,Computer Science,2021,B.E.,Walk-in from the Jayanagar desk",
  ",Imran,Sheikh,imran.sheikh@example.com,9845067890,,2000-07-04,M,CLG-SNC-01,,,,,Electronics,2022,B.Tech,",
].join("\n");

export type ParsedStudentImport =
  | { ok: true; rows: StudentImportRow[]; columns: string[] }
  | { ok: false; error: string };

const HEADER_ALIASES: Record<string, string> = {
  code: "student_code",
  student: "student_code",
  first: "first_name",
  firstname: "first_name",
  name: "first_name",
  last: "last_name",
  lastname: "last_name",
  surname: "last_name",
  mail: "email",
  email_address: "email",
  mobile: "phone",
  phone_number: "phone",
  alternate_phone: "alt_phone",
  dob: "date_of_birth",
  birth_date: "date_of_birth",
  college: "college_code",
  institution: "college_code",
  city: "city_code",
  address: "address_line1",
  address1: "address_line1",
  address2: "address_line2",
  pincode: "postal_code",
  pin_code: "postal_code",
  zip: "postal_code",
  branch: "discipline",
  stream: "discipline",
  year_of_passing: "passout_year",
  passing_year: "passout_year",
  degree: "qualification",
};

const normaliseHeader = (raw: string): string => {
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/^﻿/, "");
  return HEADER_ALIASES[key] ?? key;
};

/**
 * Text file → validated rows, or the first thing wrong with the file.
 *
 * Row numbers are the operator's line numbers — header included — because the
 * rejection they read has to match the row they scroll to.
 */
export function parseStudentImport(text: string): ParsedStudentImport {
  const table = parseDelimited(text.replace(/^﻿/, ""));
  if (table.length === 0) return { ok: false, error: "That file is empty." };

  const header = (table[0] ?? []).map(normaliseHeader);
  if (header.every((cell) => cell === "")) return { ok: false, error: "That file has no header row." };
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    return {
      ok: false,
      error:
        `The header is missing ${missing.join(", ")}. ` +
        `Expected: ${STUDENT_IMPORT_COLUMNS.join(", ")}.`,
    };
  }

  const at = (cells: string[], column: string): string => {
    const index = header.indexOf(column);
    return index === -1 ? "" : (cells[index] ?? "").trim();
  };

  const rows: StudentImportRow[] = [];
  const problems: string[] = [];
  /* Two rows naming the same person is a mistake in the FILE, and the second
     one would otherwise land as an update to the first — silently, and with
     whichever row happened to sort last winning. Caught here, where the row
     number still means something to the operator. */
  const seenEmail = new Map<string, number>();
  const seenCode = new Map<string, number>();

  for (let i = 1; i < table.length; i += 1) {
    const cells = table[i] ?? [];
    if (cells.every((cell) => cell.trim() === "")) continue;
    const rowNumber = i + 1;

    const rawYear = at(cells, "passout_year");
    const year = rawYear === "" ? undefined : Number(rawYear);
    if (year !== undefined && !Number.isInteger(year)) {
      problems.push(`Row ${rowNumber}: "${rawYear}" is not a passout year`);
      continue;
    }

    const candidate = {
      rowNumber,
      studentCode: at(cells, "student_code") || undefined,
      firstName: at(cells, "first_name"),
      lastName: at(cells, "last_name") || undefined,
      email: at(cells, "email"),
      phone: at(cells, "phone") || undefined,
      altPhone: at(cells, "alt_phone") || undefined,
      dateOfBirth: at(cells, "date_of_birth") || undefined,
      gender: at(cells, "gender") || undefined,
      collegeCode: at(cells, "college_code") || undefined,
      cityCode: at(cells, "city_code") || undefined,
      addressLine1: at(cells, "address_line1") || undefined,
      addressLine2: at(cells, "address_line2") || undefined,
      postalCode: at(cells, "postal_code") || undefined,
      discipline: at(cells, "discipline") || undefined,
      passoutYear: year,
      qualification: at(cells, "qualification") || undefined,
      notes: at(cells, "notes") || undefined,
    };

    const parsed = studentImportRowSchema.safeParse(candidate);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      problems.push(`Row ${rowNumber}: ${first?.message ?? "could not be read"}`);
      continue;
    }

    const earlierEmail = seenEmail.get(parsed.data.email);
    if (earlierEmail !== undefined) {
      problems.push(`Row ${rowNumber}: ${parsed.data.email} is already on row ${earlierEmail}`);
      continue;
    }
    seenEmail.set(parsed.data.email, rowNumber);

    if (parsed.data.studentCode) {
      const key = parsed.data.studentCode.toUpperCase();
      const earlierCode = seenCode.get(key);
      if (earlierCode !== undefined) {
        problems.push(`Row ${rowNumber}: ${parsed.data.studentCode} is already on row ${earlierCode}`);
        continue;
      }
      seenCode.set(key, rowNumber);
    }

    rows.push(parsed.data);
  }

  // A file is loaded whole or not at all. Loading the good half of a handed-over
  // spreadsheet is how a college ends up with eleven of its forty students.
  if (problems.length > 0) {
    return { ok: false, error: problems.slice(0, 8).join(" · ") };
  }
  if (rows.length === 0) return { ok: false, error: "That file has a header and no student rows." };

  // Only the columns this format knows about. An operator's stray "Remarks"
  // column is theirs to keep, and must not look like a field we could clear.
  const known = new Set<string>(STUDENT_IMPORT_COLUMNS);
  const columns = [...new Set(header.filter((c) => known.has(c)))];

  return { ok: true, rows, columns };
}
