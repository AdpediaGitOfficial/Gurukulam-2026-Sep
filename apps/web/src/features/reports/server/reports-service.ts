import "server-only";

import { z } from "zod";
import {
  measureSchema,
  reportCatalogueEntrySchema,
  reportMetaSchema,
  type Measure,
  type ReportCatalogueEntry,
  type ReportMeta,
} from "@gurukulam/contracts";

import { apiFetch } from "@/server/api";
import { queryString, type SearchParams } from "@/server/list";

const librarySchema = z.object({
  total: z.number().int(),
  built: z.number().int(),
  reports: z.array(reportCatalogueEntrySchema),
});

export type ReportLibrary = z.infer<typeof librarySchema>;
export type { ReportCatalogueEntry };

/**
 * The report library.
 *
 * Every entry names its measures and dimensions, so one catalogued but not yet
 * built is a query to fill in rather than a screen to design — which is why the
 * list shows both, rather than hiding what does not exist yet.
 */
export async function getReportLibrary(): Promise<ReportLibrary> {
  return librarySchema.parse(await apiFetch("/reports"));
}

const reportEnvelope = <TRow extends z.ZodTypeAny>(row: TRow) =>
  z.object({
    meta: reportMetaSchema,
    measures: z.array(measureSchema),
    rows: z.array(row),
  });

export interface Report<TRow> {
  meta: ReportMeta;
  measures: Measure[];
  rows: TRow[];
}

/** Filters every report accepts, on top of its window. */
const REPORT_FILTERS = ["from", "to", "compare", "cityId", "collegeId", "courseId", "batchId", "segment"] as const;

/**
 * Runs one report.
 *
 * Every report returns the same envelope — meta, headline measures, rows — so
 * one page shell renders all of them rather than four near-identical screens
 * drifting apart.
 *
 * The window is required by the contract, so a page that arrives without one
 * supplies a default rather than failing: a report with no dates is a form,
 * not a report, and an operator opening it wants to see numbers.
 */
export async function runReport<TRow extends z.ZodTypeAny>(
  key: string,
  row: TRow,
  params: SearchParams,
): Promise<Report<z.infer<TRow>>> {
  const query = queryString({ ...defaultWindow(params), ...params }, REPORT_FILTERS);
  const response = await apiFetch(`/reports/${key}${query}`);
  return reportEnvelope(row).parse(response) as Report<z.infer<TRow>>;
}

/**
 * The current financial year — the window an operator means by default.
 *
 * The WHOLE year, not year-to-date. A delivery report is largely about what is
 * coming: a batch that starts next month is exactly what an operator opens
 * "batch progress" to check on, and a to-date window hides every one of them
 * while looking like there is nothing to see. Money reports are unaffected,
 * since nothing is collected in the future.
 *
 * India's financial year runs April to March; before April, the current year
 * began last April. A calendar-year default would split each year's
 * collections across two reports.
 */
export function defaultWindow(params: SearchParams): { from: string; to: string } {
  const from = typeof params["from"] === "string" && params["from"] !== "" ? params["from"] : undefined;
  const to = typeof params["to"] === "string" && params["to"] !== "" ? params["to"] : undefined;
  if (from !== undefined && to !== undefined) return { from, to };

  const now = new Date();
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    from: from ?? `${startYear}-04-01`,
    to: to ?? `${startYear + 1}-03-31`,
  };
}
