import "server-only";

import { z } from "zod";
import { reportCatalogueEntrySchema, type ReportCatalogueEntry } from "@gurukulam/contracts";

import { apiFetch } from "@/server/api";

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
