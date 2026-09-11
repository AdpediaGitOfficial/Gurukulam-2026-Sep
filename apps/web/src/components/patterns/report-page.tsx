import type { ReactNode } from "react";
import { formatRupees, fromWire, type Measure, type ReportMeta } from "@gurukulam/contracts";

import { ModuleTabs } from "@/components/patterns/module-tabs";
import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { formatCount } from "@/lib/format";
import type { SearchParams } from "@/lib/href";

/** Renders a measure in its own unit. Money never becomes a number on the way. */
function measureValue(measure: Pick<Measure, "value" | "unit">): string {
  switch (measure.unit) {
    case "money":
      return formatRupees(fromWire(measure.value), { paise: false });
    case "percent":
      return `${measure.value}%`;
    case "days":
      return `${measure.value} ${measure.value === "1" ? "day" : "days"}`;
    default:
      return formatCount(Number(measure.value));
  }
}

/**
 * Change against the previous window.
 *
 * Direction is stated, never coloured: whether a rise is good depends on the
 * measure — collections up is good, outstanding up is not — and a green arrow
 * on a growing debt is worse than no arrow at all.
 */
function MeasureDelta({ measure }: { measure: Measure }) {
  if (measure.delta === null || measure.previous === null) return null;

  const rising = !measure.delta.startsWith("-");
  const magnitude = measureValue({ value: measure.delta.replace(/^-/, ""), unit: measure.unit });

  return (
    <span className="mt-1 flex items-center gap-1 text-caption text-ink-muted">
      <Icon name="chev" size={12} className={cn(rising && "rotate-180")} />
      {magnitude} vs previous
    </span>
  );
}

export interface ReportPageProps {
  eyebrow?: string;
  title: string;
  description: string;
  meta: ReportMeta;
  measures: readonly Measure[];
  params: SearchParams;
  /** The report's own table. */
  children: ReactNode;
}

/**
 * The shell every report renders in.
 *
 * All four return the same envelope — meta, headline measures, rows — so this
 * exists once rather than as four screens that drift apart. The window is a
 * plain GET form for the same reason list filters are: a report someone can
 * send to a colleague as a URL is worth more than one they have to describe.
 */
export function ReportPage({
  eyebrow = "Reports",
  title,
  description,
  meta,
  measures,
  params,
  children,
}: ReportPageProps) {
  const carried = Object.entries(params).filter(
    ([key]) => key !== "from" && key !== "to" && key !== "compare",
  );

  return (
    <PageBody>
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <ModuleTabs />

      <form method="get" className="flex flex-wrap items-end gap-3">
        {carried.map(([key, value]) => (
          <input
            key={key}
            type="hidden"
            name={key}
            value={Array.isArray(value) ? (value[0] ?? "") : (value ?? "")}
          />
        ))}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="report-from" className="text-body-sm font-medium text-ink">
            From
          </label>
          <input
            id="report-from"
            name="from"
            type="date"
            defaultValue={meta.from.slice(0, 10)}
            className="h-11 rounded-control border border-hairline-strong bg-surface px-3.5 text-body text-ink focus:border-brand focus:outline-none"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="report-to" className="text-body-sm font-medium text-ink">
            To
          </label>
          <input
            id="report-to"
            name="to"
            type="date"
            defaultValue={meta.to.slice(0, 10)}
            className="h-11 rounded-control border border-hairline-strong bg-surface px-3.5 text-body text-ink focus:border-brand focus:outline-none"
          />
        </div>

        <label className="flex h-11 cursor-pointer items-center gap-2 text-body-sm text-ink">
          <input
            type="checkbox"
            name="compare"
            value="true"
            defaultChecked={params["compare"] === "true"}
            className="size-4 accent-brand"
          />
          Compare to previous
        </label>

        <button
          type="submit"
          className="h-11 cursor-pointer rounded-full bg-brand px-5 text-body font-medium text-white shadow-raised transition-colors hover:bg-brand/90"
        >
          Run
        </button>

        {/*
          Scope is applied inside the service, never chosen here. Echoing it
          back is what stops a figure being read as global when it was not.
        */}
        <span className="ml-auto self-center text-body-sm text-ink-muted">
          {meta.scope.label} · {formatCount(meta.rowCount)}{" "}
          {meta.rowCount === 1 ? "row" : "rows"}
        </span>
      </form>

      {measures.length === 0 ? null : (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {measures.map((measure) => (
            <Card key={measure.key} className="flex flex-col">
              <span className="text-body-sm text-ink-muted">{measure.label}</span>
              <span className="mt-1 text-metric-sm text-ink tabular-nums">
                {measureValue(measure)}
              </span>
              <MeasureDelta measure={measure} />
            </Card>
          ))}
        </div>
      )}

      {children}

      <p className="text-caption text-ink-subtle">
        Generated {new Date(meta.generatedAt).toLocaleString("en-IN")}
        {meta.comparedFrom === null
          ? ""
          : ` · compared against ${meta.comparedFrom.slice(0, 10)} – ${meta.comparedTo?.slice(0, 10) ?? ""}`}
      </p>
    </PageBody>
  );
}
