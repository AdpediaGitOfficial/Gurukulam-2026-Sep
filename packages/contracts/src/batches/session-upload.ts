import { z } from "zod";
import { deliveryModeSchema } from "./index.js";

/**
 * Bulk session upload — the format, and what an upload is allowed to do.
 *
 * A batch's sessions arrive in instalments. An operator schedules the first
 * fortnight today and the rest when the trainer confirms their second month,
 * so **an upload ADDS to what is already there and never replaces it**. There
 * is no delete path in this file at all: removing a session is a deliberate,
 * single act with its own guard (a completed session is delivery history and
 * cannot be removed), and a spreadsheet is the wrong instrument for it.
 *
 * That guarantee needs two mechanisms, not one:
 *
 *   · **Identity.** A row that names an existing session updates it; a row
 *     that names nothing is new. So the file carries an OPTIONAL `session_code`
 *     column — blank on the first upload, filled on an export-edit-reupload.
 *     Codes are still generated on save (invariant 9); the column identifies,
 *     it never assigns.
 *
 *   · **Collision.** A batch cannot sit in two places at once, so
 *     `(batch, date, start time)` identifies a sitting whether or not anybody
 *     typed a code. Uploading the same file twice therefore lands on the same
 *     sessions rather than doubling the fortnight — which is the failure this
 *     whole module exists to prevent. The database carries the same rule as a
 *     partial unique index, because two operators pasting at once is exactly
 *     when an in-process check is not enough.
 *
 * Nothing here writes on its own. `dryRun` returns the plan — what would be
 * added, what would be updated, what is refused and why — and the console
 * shows it before anything is committed.
 */

/** "HH:MM", 24-hour. */
const timeString = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 09:30");

/** "YYYY-MM-DD". Parsed strictly: 2026-02-30 is not a date. */
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-01")
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
export const sessionUploadRowSchema = z
  .object({
    rowNumber: z.number().int().min(1),
    /** Blank for a new session. Present to update one that already exists. */
    sessionCode: z.string().trim().max(32).optional(),
    title: z.string().trim().min(1, "Give the session a title").max(200),
    scheduledDate: dateString,
    startTime: timeString,
    endTime: timeString,
    /** Matched on title against THIS BATCH'S COURSE. Topics carry no code. */
    topic: z.string().trim().max(200).optional(),
    /** TRN-0042. Blank inherits the batch's primary trainer. */
    trainerCode: z.string().trim().max(32).optional(),
    mode: deliveryModeSchema.optional(),
    venue: z.string().trim().max(255).optional(),
    meetingLink: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.endTime > v.startTime, {
    message: "The session must end after it starts",
    path: ["endTime"],
  });

export type SessionUploadRow = z.infer<typeof sessionUploadRowSchema>;

export const sessionUploadSchema = z.object({
  /**
   * True returns the plan and writes nothing. The console always asks for the
   * plan first — "it replaced my sessions" is not a thing anyone should learn
   * after the fact.
   */
  dryRun: z.boolean().default(false),
  rows: z
    .array(sessionUploadRowSchema)
    .min(1, "The file has no session rows")
    .max(200, "Split the file — 200 sessions is the most one upload takes"),
});

export type SessionUploadInput = z.infer<typeof sessionUploadSchema>;

export const uploadOutcomeSchema = z.enum(["ADD", "UPDATE", "UNCHANGED", "REJECT"]);
export type UploadOutcome = z.infer<typeof uploadOutcomeSchema>;

/** What the upload would do, or did, with one row. */
export const sessionUploadLineSchema = z.object({
  rowNumber: z.number().int(),
  outcome: uploadOutcomeSchema,
  /** The session this row lands on — known for UPDATE, and after an ADD commits. */
  sessionId: z.string().nullable(),
  sessionCode: z.string().nullable(),
  title: z.string(),
  scheduledDate: z.string(),
  startTime: z.string(),
  /** Why it was refused, or what an update would change. Empty for a clean add. */
  detail: z.string().nullable(),
});

export type SessionUploadLine = z.infer<typeof sessionUploadLineSchema>;

export const sessionUploadResultSchema = z.object({
  batchId: z.string(),
  batchCode: z.string(),
  /** False when this was a dry run, so the screen can say so plainly. */
  committed: z.boolean(),
  added: z.number().int(),
  updated: z.number().int(),
  unchanged: z.number().int(),
  rejected: z.number().int(),
  /** Live sessions the batch had before this upload. Never decreases. */
  existingBefore: z.number().int(),
  lines: z.array(sessionUploadLineSchema),
});

export type SessionUploadResult = z.infer<typeof sessionUploadResultSchema>;

// ── The file format ───────────────────────────────────────────────────────

/**
 * The columns, in order, as the template writes them.
 *
 * A file is matched on its HEADER rather than on position, so a spreadsheet
 * that reorders columns still loads. Only `date`, `start_time`, `end_time` and
 * `title` are required.
 */
export const SESSION_UPLOAD_COLUMNS = [
  "session_code",
  "date",
  "start_time",
  "end_time",
  "title",
  "topic",
  "trainer_code",
  "mode",
  "venue",
  "meeting_link",
] as const;

const REQUIRED_COLUMNS = ["date", "start_time", "end_time", "title"] as const;

/** A header row plus one worked example, for the template download. */
export const SESSION_UPLOAD_TEMPLATE = [
  SESSION_UPLOAD_COLUMNS.join(","),
  ",2026-10-01,09:30,11:00,Window functions,SQL deep dive,,OFFLINE,Lab 2,",
  ",2026-10-03,09:30,11:00,Joins revisited,SQL deep dive,TRN-0042,ONLINE,,https://meet.example.com/abc",
].join("\n");

/**
 * RFC 4180 enough: quoted fields, embedded commas, doubled quotes, CR/LF.
 *
 * Written rather than installed. A CSV parser is thirty lines and a dependency
 * is forever, and this one has to agree exactly with the schema above — which
 * is why it lives beside it rather than in whichever app happens to read a
 * file first.
 */
export function parseDelimited(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let started = false;

  const endField = () => {
    row.push(field);
    field = "";
    started = false;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        // A doubled quote inside a quoted field is one literal quote.
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && !started) {
      quoted = true;
      started = true;
    } else if (char === "," || char === "\t") {
      endField();
    } else if (char === "\r") {
      // Swallow it; the \n that follows ends the row. A lone \r ends it too.
      if (text[i + 1] !== "\n") endRow();
    } else if (char === "\n") {
      endRow();
    } else {
      field += char;
      started = true;
    }
  }
  // A file that does not end in a newline still has a last row.
  if (field !== "" || row.length > 0) endRow();

  // Blank lines are KEPT. They carry no data, but they carry line numbers, and
  // a rejection that says "row 14" has to mean the row the operator scrolls to.
  return rows;
}

export type ParsedUpload =
  | { ok: true; rows: SessionUploadRow[] }
  | { ok: false; error: string };

const HEADER_ALIASES: Record<string, string> = {
  code: "session_code",
  session: "session_code",
  scheduled_date: "date",
  start: "start_time",
  end: "end_time",
  end_time: "end_time",
  name: "title",
  trainer: "trainer_code",
  link: "meeting_link",
  url: "meeting_link",
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
export function parseSessionUpload(text: string): ParsedUpload {
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
        `Expected: ${SESSION_UPLOAD_COLUMNS.join(", ")}.`,
    };
  }

  const at = (cells: string[], column: string): string => {
    const index = header.indexOf(column);
    return index === -1 ? "" : (cells[index] ?? "").trim();
  };

  const rows: SessionUploadRow[] = [];
  const problems: string[] = [];

  for (let i = 1; i < table.length; i += 1) {
    const cells = table[i] ?? [];
    if (cells.every((cell) => cell.trim() === "")) continue;
    const rowNumber = i + 1;
    const rawMode = at(cells, "mode").toUpperCase();

    const candidate = {
      rowNumber,
      sessionCode: at(cells, "session_code") || undefined,
      title: at(cells, "title"),
      scheduledDate: at(cells, "date"),
      startTime: at(cells, "start_time"),
      endTime: at(cells, "end_time"),
      topic: at(cells, "topic") || undefined,
      trainerCode: at(cells, "trainer_code") || undefined,
      mode: rawMode === "" ? undefined : rawMode,
      venue: at(cells, "venue") || undefined,
      meetingLink: at(cells, "meeting_link") || undefined,
    };

    const parsed = sessionUploadRowSchema.safeParse(candidate);
    if (parsed.success) {
      rows.push(parsed.data);
    } else {
      const first = parsed.error.issues[0];
      problems.push(`Row ${rowNumber}: ${first?.message ?? "could not be read"}`);
    }
  }

  // A file is loaded whole or not at all. Loading the good half of a
  // spreadsheet is how an operator ends up with a schedule missing Tuesdays.
  if (problems.length > 0) {
    return { ok: false, error: problems.slice(0, 8).join(" · ") };
  }
  if (rows.length === 0) return { ok: false, error: "That file has a header and no session rows." };

  return { ok: true, rows };
}
