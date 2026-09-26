import "server-only";

/**
 * Turning a list into a file the operator can open in a spreadsheet.
 *
 * Deliberately here rather than in the API. Export is a CONSOLE concern: what
 * it writes is the columns the screen shows, in the order it shows them, and
 * those live in the page's `Column` descriptors. An `/export` endpoint would
 * be a second definition of every list, and the two would drift on exactly the
 * thing that matters — which is that the file matches what the operator was
 * looking at when they pressed the button.
 *
 * It also inherits scope and filters for free: it calls the same service the
 * page does, with the same searchParams, so a regional sub-admin exports their
 * own city and a filtered view exports what it filtered to.
 */

/**
 * One CSV field, RFC 4180.
 *
 * The leading apostrophe on =, +, - and @ is not decoration: a spreadsheet
 * treats a cell starting with those as a FORMULA, so a student called
 * "=cmd|..." becomes code the moment somebody opens the file. Prefixing makes
 * it text. This is the one piece of escaping that protects a person rather
 * than the format.
 */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** Header row plus one line per record. */
export function toCsv<TRow>(
  columns: ReadonlyArray<{ header: string; value: (row: TRow) => unknown }>,
  rows: readonly TRow[],
): string {
  const lines = [columns.map((c) => csvField(c.header)).join(",")];
  for (const row of rows) lines.push(columns.map((c) => csvField(c.value(row))).join(","));
  // CRLF and a BOM: Excel on Windows reads a plain UTF-8 CSV as Latin-1 and
  // turns ₹ into three characters. The BOM is what stops that.
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** The download response, named so the file says what it is and when. */
export function csvResponse(body: string, basename: string): Response {
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${basename}-${stamp}.csv"`,
      // An export is a snapshot of a moment; a cached one is a lie about now.
      "cache-control": "no-store",
    },
  });
}

/**
 * The largest page the API will serve. Asking for more is a validation error,
 * not a bigger page — which is how the first draft of this exporter 500-ed.
 */
const MAX_PAGE_SIZE = 200;

/**
 * The ceiling on one export, in rows.
 *
 * An export that silently stops at the first page is worse than no export,
 * because somebody reconciles against it — so this pages through rather than
 * truncating. The ceiling exists so one click cannot walk a million-row table;
 * reaching it is reported rather than hidden.
 */
export const EXPORT_ROW_LIMIT = 10_000;

export interface ExportedRows<TRow> {
  rows: TRow[];
  /** True when the ceiling stopped us before the data did. */
  truncated: boolean;
}

/**
 * Every row the filters select, not just the first page.
 *
 * Takes the same `listX(params)` the screen uses, so the file inherits the
 * caller's filters and scope without this knowing what either of them are.
 */
export async function collectAll<TRow>(
  fetchPage: (params: Record<string, string>) => Promise<{ rows: TRow[]; totalPages: number }>,
  params: Record<string, string>,
): Promise<ExportedRows<TRow>> {
  const rows: TRow[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const result = await fetchPage({
      ...params,
      page: String(page),
      pageSize: String(MAX_PAGE_SIZE),
    });
    rows.push(...result.rows);
    totalPages = result.totalPages;
    page += 1;
  } while (page <= totalPages && rows.length < EXPORT_ROW_LIMIT);

  return { rows: rows.slice(0, EXPORT_ROW_LIMIT), truncated: rows.length > EXPORT_ROW_LIMIT };
}
