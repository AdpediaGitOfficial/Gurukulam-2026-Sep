import { Controller, Get, Query, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { reportQuerySchema, type Principal, type ReportQuery } from "@gurukulam/contracts";
import { ReportsService, toCsv } from "./reports.service";
import { REPORT_CATALOGUE } from "./catalogue";
import { zodBody } from "../../common/pipes/zod-validation.pipe";
import { CurrentPrincipal, RequirePermission } from "../../common/decorators/principal.decorator";
import { serialise } from "../../common/interceptors/serialise.interceptor";

@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /**
   * The library. Every entry names its measures and dimensions, so a
   * SPECIFIED one is a query to fill in rather than a screen to redesign.
   */
  @Get()
  @RequirePermission("reports", "read")
  library() {
    return {
      total: REPORT_CATALOGUE.length,
      built: REPORT_CATALOGUE.filter((r) => r.status === "BUILT").length,
      reports: REPORT_CATALOGUE,
    };
  }

  @Get("outstanding")
  @RequirePermission("reports", "read")
  outstanding(@CurrentPrincipal() p: Principal, @Query(zodBody(reportQuerySchema)) q: ReportQuery, @Res({ passthrough: true }) reply: FastifyReply) {
    return this.deliver(this.reports.outstanding(p, q), q, reply);
  }

  @Get("collections")
  @RequirePermission("reports", "read")
  collections(@CurrentPrincipal() p: Principal, @Query(zodBody(reportQuerySchema)) q: ReportQuery, @Res({ passthrough: true }) reply: FastifyReply) {
    return this.deliver(this.reports.collections(p, q), q, reply);
  }

  @Get("unallocated")
  @RequirePermission("reports", "read")
  unallocated(@CurrentPrincipal() p: Principal, @Query(zodBody(reportQuerySchema)) q: ReportQuery, @Res({ passthrough: true }) reply: FastifyReply) {
    return this.deliver(this.reports.unallocated(p, q), q, reply);
  }

  @Get("batch-progress")
  @RequirePermission("reports", "read")
  batchProgress(@CurrentPrincipal() p: Principal, @Query(zodBody(reportQuerySchema)) q: ReportQuery, @Res({ passthrough: true }) reply: FastifyReply) {
    return this.deliver(this.reports.batchProgress(p, q), q, reply);
  }

  /**
   * One delivery path for every report, so CSV and JSON cannot diverge —
   * the CSV is rendered from the SAME rows the JSON returns, rather than a
   * second query that drifts.
   */
  private async deliver<T extends Record<string, unknown>>(
    pending: Promise<{ meta: { reportKey: string }; rows: T[] }>,
    query: ReportQuery,
    reply: FastifyReply,
  ) {
    const report = await pending;
    if (query.format !== "csv") return report;

    const csv = toCsv(serialise(report.rows) as Record<string, unknown>[]);
    void reply
      .type("text/csv; charset=utf-8")
      .header(
        "content-disposition",
        `attachment; filename="${report.meta.reportKey}-${query.from}-to-${query.to}.csv"`,
      );
    return csv;
  }
}
