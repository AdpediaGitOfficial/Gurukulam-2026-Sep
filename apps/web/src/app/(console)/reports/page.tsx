import type { Metadata, Route } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/patterns/page-header";
import { ModuleTabs } from "@/components/patterns/module-tabs";
import { PageBody, PageSection } from "@/components/patterns/page-section";
import { StatTile, StatTileGrid } from "@/components/patterns/stat-tile";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Icon, type IconName } from "@/components/ui/icon";
import {
  getReportLibrary,
  type ReportCatalogueEntry,
} from "@/features/reports/server/reports-service";
import { requireModule } from "@/server/principal";
import { brandTokens, domainTokens, feedbackTokens } from "@/design-system/tokens";
import { cn } from "@/lib/cn";
import { formatCount } from "@/lib/format";

export const metadata: Metadata = { title: "Reports" };

/** Each group gets its own colour and glyph, so the library reads as sections rather than one long list. */
const GROUPS: Record<ReportCatalogueEntry["group"], { color: string; icon: IconName }> = {
  Money: { color: brandTokens.gold, icon: "rupee" },
  Enrolment: { color: domainTokens.students, icon: "users" },
  Delivery: { color: domainTokens.trainers, icon: "batch" },
  Outcomes: { color: feedbackTokens.success, icon: "seal" },
  Placement: { color: domainTokens.colleges, icon: "brief" },
};

const GROUP_ORDER = ["Money", "Enrolment", "Delivery", "Outcomes", "Placement"] as const;

/**
 * Report screens that exist in the console.
 *
 * The catalogue's own `BUILT` means the API query is implemented, which is not
 * the same thing — linking on that alone sends the operator to a 404. A report
 * whose query is ready but whose screen is not says so.
 */
const CONSOLE_SCREENS = new Set<string>([
  "/reports/outstanding",
  "/reports/collections",
  "/reports/unallocated",
  "/reports/batch-progress",
]);

function ReportCard({ report }: { report: ReportCatalogueEntry }) {
  const group = GROUPS[report.group];
  const queryReady = report.status === "BUILT" && report.path !== null;
  const built = queryReady && report.path !== null && CONSOLE_SCREENS.has(report.path);

  const body = (
    <>
      <span
        className="mb-3 grid size-10 place-items-center rounded-tile"
        style={{ color: group.color, backgroundColor: "color-mix(in srgb, currentColor 12%, transparent)" }}
      >
        <Icon name={group.icon} size={19} />
      </span>
      <span className="block text-body font-semibold text-ink">{report.title}</span>
      <span className="mt-1 block text-body-sm text-ink-subtle">{report.description}</span>
      <span className="mt-3 flex flex-wrap gap-1.5">
        {built ? (
          <Chip variant="solid" color={feedbackTokens.success}>
            Built
          </Chip>
        ) : queryReady ? (
          <Chip color={feedbackTokens.warning}>Query ready</Chip>
        ) : (
          <Chip>Specified</Chip>
        )}
        {report.measures.slice(0, 2).map((measure) => (
          <Chip key={measure}>{measure}</Chip>
        ))}
      </span>
    </>
  );

  const shell = cn(
    "flex flex-col rounded-well border border-hairline bg-surface p-[18px] transition-shadow",
    built ? "hover:border-hairline-strong hover:shadow-raised" : "opacity-80",
  );

  // A specified report has nowhere to go yet. Rendering it as a link that does
  // nothing is worse than rendering it as what it is.
  return built ? (
    <Link href={report.path as Route} className={shell}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}

export default async function ReportsPage() {
  await requireModule("reports");
  const library = await getReportLibrary();

  const groups = GROUP_ORDER.map((name) => ({
    name,
    reports: library.reports.filter((report) => report.group === name),
  })).filter((group) => group.reports.length > 0);

  return (
    <PageBody>
      <PageHeader
        eyebrow="Reports"
        title="Report library"
        description="Every report is a saved combination of measures, dimensions and filters. Scope is applied inside the service — you only ever see your own regions."
      />
      <ModuleTabs />

      <StatTileGrid>
        <StatTile
          label="Reports catalogued"
          value={formatCount(library.total)}
          caption={`Across ${groups.length} groups`}
          icon="chart"
          color={brandTokens.gold}
        />
        <StatTile
          label="Query ready"
          value={formatCount(library.built)}
          caption="Implemented in the API"
          icon="check"
          color={feedbackTokens.success}
        />
        <StatTile
          label="Specified"
          value={formatCount(library.total - library.built)}
          caption="Measures named, query pending"
          icon="task"
          color={brandTokens.inkMuted}
        />
        <StatTile
          label="Groups"
          value={formatCount(groups.length)}
          caption="Money, enrolment, delivery, outcomes, placement"
          icon="apps"
          color={domainTokens.colleges}
        />
      </StatTileGrid>

      {groups.map((group) => (
        <PageSection
          key={group.name}
          title={group.name}
          description={`${group.reports.filter((r) => r.status === "BUILT").length} of ${group.reports.length} with a query built`}
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {group.reports.map((report) => (
              <ReportCard key={report.key} report={report} />
            ))}
          </div>
        </PageSection>
      ))}

      {groups.length === 0 ? (
        <Card>
          <p className="text-body text-ink-muted">The report catalogue is empty.</p>
        </Card>
      ) : null}
    </PageBody>
  );
}
