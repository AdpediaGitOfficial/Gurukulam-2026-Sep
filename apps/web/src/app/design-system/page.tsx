import type { Metadata, Route } from "next";

import { FilterTabs } from "@/components/patterns/filter-tabs";
import { FilterToolbar } from "@/components/patterns/filter-toolbar";
import { PromoBanner } from "@/components/patterns/promo-banner";
import { InsightPanel } from "@/components/patterns/insight-panel";
import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { StatTile, StatTileGrid } from "@/components/patterns/stat-tile";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Chip } from "@/components/ui/chip";
import { DataTable, type Column } from "@/components/ui/data-table";
import { DonutChart } from "@/components/ui/donut-chart";
import { EmptyState } from "@/components/ui/empty-state";
import { Flag } from "@/components/ui/flag";
import { Icon } from "@/components/ui/icon";
import { SearchField, TextField } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SelectField } from "@/components/ui/select";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { StackedBar } from "@/components/ui/stacked-bar";
import { StatusPill } from "@/components/ui/status-pill";
import { Switch } from "@/components/ui/switch";
import { TextareaField } from "@/components/ui/textarea";
import { Tooltip } from "@/components/ui/tooltip";
import {
  brandTokens,
  domainTokens,
  feedbackTextTokens,
  feedbackTokens,
} from "@/design-system/tokens";
import { OverlayDemo } from "@/features/design-system/components/overlay-demo";
import {
  ShowcaseSection,
  Specimen,
  SwatchGrid,
} from "@/features/design-system/components/showcase";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Design System",
};

const SURFACE_SWATCHES = [
  { utility: "canvas", token: "var(--color-canvas)" },
  { utility: "surface", token: "var(--color-surface)" },
  { utility: "surface-sunken", token: "var(--color-surface-sunken)" },
  { utility: "surface-muted", token: "var(--color-surface-muted)" },
  { utility: "surface-soft", token: "var(--color-surface-soft)" },
  { utility: "hairline", token: "var(--color-hairline)" },
  { utility: "hairline-strong", token: "var(--color-hairline-strong)" },
];

const INK_SWATCHES = [
  { utility: "ink", token: "var(--color-ink)" },
  { utility: "ink-muted", token: "var(--color-ink-muted)" },
  { utility: "ink-subtle", token: "var(--color-ink-subtle)" },
  { utility: "on-accent", token: "var(--color-on-accent)" },
];

const BRAND_SWATCHES = [
  { utility: "brand", token: brandTokens.brand },
  { utility: "accent", token: brandTokens.accent },
  { utility: "rail", token: brandTokens.rail },
];

const FEEDBACK_SWATCHES = Object.entries(feedbackTokens).map(([utility, token]) => ({
  utility,
  token,
}));

const DOMAIN_SWATCHES = Object.entries(domainTokens).map(([key, token]) => ({
  utility: `domain-${key}`,
  token,
}));

// Class names must be literal strings — Tailwind scans source text, so
// `rounded-${name}` would never be generated.
const RADII = [
  { label: "chip", className: "rounded-chip" },
  { label: "control", className: "rounded-control" },
  { label: "tile", className: "rounded-tile" },
  { label: "well", className: "rounded-well" },
  { label: "card", className: "rounded-card" },
  { label: "panel", className: "rounded-panel" },
];

const ELEVATIONS = [
  { label: "raised", className: "shadow-raised" },
  { label: "panel", className: "shadow-panel" },
  { label: "floating", className: "shadow-floating" },
  { label: "overlay", className: "shadow-overlay" },
];

const TYPE_SCALE = [
  { name: "text-display", usage: "Hero metric on a coloured panel" },
  { name: "text-metric", usage: "Figure at the centre of a chart" },
  { name: "text-metric-sm", usage: "Figure inside a compact ring" },
  { name: "text-h1", usage: "Page title — one per page" },
  { name: "text-h2", usage: "Section heading" },
  { name: "text-h3", usage: "Card heading" },
  { name: "text-body", usage: "Default copy and table cells" },
  { name: "text-body-sm", usage: "Secondary copy, labels, controls" },
  { name: "text-caption", usage: "Captions, IDs, metadata" },
  { name: "text-overline", usage: "Uppercase eyebrow above a name" },
];

interface DemoRow {
  id: string;
  module: string;
  owner: string;
}

const DEMO_COLUMNS: ReadonlyArray<Column<DemoRow>> = [
  { id: "id", header: "ID", cell: (row) => <span className="font-mono text-caption">{row.id}</span> },
  { id: "module", header: "Module", cell: (row) => row.module },
  { id: "owner", header: "Owner", cell: (row) => row.owner, align: "end" },
];

const DEMO_ROWS: DemoRow[] = [
  { id: "#OPS-1", module: "Colleges", owner: "Platform" },
  { id: "#OPS-2", module: "Question Bank", owner: "Content" },
];

/**
 * Living style guide at `/design-system`.
 *
 * Every token and component the console ships, rendered from the real source.
 * If something is not on this page, it is not part of the system yet.
 */
export default function DesignSystemPage() {
  return (
    <PageBody>
      <PageHeader
        title="Design System"
        description="Tokens, primitives and patterns. Build new pages from these — never from raw hex, px or one-off layouts."
      />

      <ShowcaseSection
        id="colour"
        title="Colour"
        description="Defined in app/globals.css. Use the Tailwind utility (bg-brand); reach for the CSS variable only when a colour must go through an inline style, such as a chart series."
      >
        <Card className="flex flex-col gap-6">
          <SwatchGrid items={SURFACE_SWATCHES} />
          <SwatchGrid items={INK_SWATCHES} />
          <SwatchGrid items={BRAND_SWATCHES} />
          <SwatchGrid items={FEEDBACK_SWATCHES} />
          <SwatchGrid items={DOMAIN_SWATCHES} />
        </Card>
      </ShowcaseSection>

      <ShowcaseSection
        id="typography"
        title="Typography"
        description="Semantic, not sized. Use text-h1, never text-[20px] — the scale can then change in one place."
      >
        <Card className="flex flex-col gap-4">
          {TYPE_SCALE.map((item) => (
            <div key={item.name} className="flex flex-wrap items-baseline gap-4">
              <code className="w-40 shrink-0 font-mono text-caption text-ink-subtle">{item.name}</code>
              <span className={item.name}>Gurukulam TMS</span>
              <span className="text-caption text-ink-muted">{item.usage}</span>
            </div>
          ))}
        </Card>
      </ShowcaseSection>

      <ShowcaseSection
        id="shape"
        title="Radius & elevation"
        description="Four radii and four shadows cover the whole product. A new value needs a token, not an arbitrary class."
      >
        <div className="grid gap-6 md:grid-cols-2">
          <Specimen name="rounded-chip / control / tile / well / card / panel">
            {RADII.map((radius) => (
              <span
                key={radius.label}
                className={cn(
                  "flex size-20 items-center justify-center border border-hairline bg-surface text-caption text-ink-muted",
                  radius.className,
                )}
              >
                {radius.label}
              </span>
            ))}
          </Specimen>
          <Specimen name="shadow-raised / panel / floating / overlay">
            {ELEVATIONS.map((elevation) => (
              <span
                key={elevation.label}
                className={cn(
                  "flex size-20 items-center justify-center rounded-card bg-surface text-caption text-ink-muted",
                  elevation.className,
                )}
              >
                {elevation.label}
              </span>
            ))}
          </Specimen>
        </div>
      </ShowcaseSection>

      <ShowcaseSection
        id="actions"
        title="Actions"
        description="One ladder for the whole product: exactly one primary per view, secondary beside it, ghost for icon-only chrome, link for inline navigation, danger for destructive confirmation only. There is deliberately no second filled colour — 'create a record' looks identical in every module."
      >
        <div className="grid gap-6 md:grid-cols-2">
          <Specimen name="<Button variant>" usage="1 primary → 2 secondary → 3 ghost → 4 link">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link" size="inline">
              Link
            </Button>
            <Button variant="danger">Danger</Button>
          </Specimen>
          <Specimen name="<Button size>" usage="sm · md · icon">
            <Button size="sm">Small</Button>
            <Button size="md">
              <Icon name="plus" />
              Medium
            </Button>
            <Button variant="ghost" size="icon" aria-label="Notifications">
              <Icon name="bell" />
            </Button>
            <Button disabled>Disabled</Button>
          </Specimen>
        </div>
      </ShowcaseSection>

      <ShowcaseSection
        id="status"
        title="Chips & status"
        description="Chip carries a domain colour; StatusPill carries a feedback intent. Never invent a third way to show state."
      >
        <div className="grid gap-6 md:grid-cols-2">
          <Specimen name="<Chip color={domainTokens.x}>" usage="module tags in tables">
            {Object.entries(domainTokens).map(([key, token]) => (
              <Chip key={key} color={token}>
                {key.replace("-", " ")}
              </Chip>
            ))}
          </Specimen>
          <Specimen name="<StatusPill intent>" usage="record lifecycle">
            <StatusPill intent="success">Success</StatusPill>
            <StatusPill intent="info">Processing</StatusPill>
            <StatusPill intent="warning">Pending</StatusPill>
            <StatusPill intent="danger">Failed</StatusPill>
            <Chip variant="outline">Outline chip</Chip>
          </Specimen>

          <Specimen name="<Flag alpha2>" usage="derived from the ISO code, not an asset">
            <Flag alpha2="IN" name="India" />
            <Flag alpha2="GB" name="United Kingdom" />
            <Flag alpha2="AE" name="United Arab Emirates" />
            <Flag alpha2="KE" name="Kenya" />
          </Specimen>

          <Specimen
            name="feedbackTextTokens"
            usage="text-safe intent shades — base colours fail 4.5:1"
            className="md:col-span-2"
          >
            {(["success", "warning", "danger", "info"] as const).map((intent) => (
              <span key={intent} className="flex items-center gap-2">
                <span className="text-body-sm" style={{ color: feedbackTokens[intent] }}>
                  {intent} base
                </span>
                <span className="text-body-sm" style={{ color: feedbackTextTokens[intent] }}>
                  {intent} strong
                </span>
              </span>
            ))}
          </Specimen>
        </div>
      </ShowcaseSection>

      <ShowcaseSection
        id="forms"
        title="Forms"
        description="Every control is labelled. Ids are explicit because these render on the server, where useId is unavailable — wire htmlFor, id and aria-describedby to the same base string."
      >
        <div className="grid gap-6 md:grid-cols-2">
          <Specimen name="<TextField> · <SelectField>" className="[&>div:last-child]:flex-col [&>div:last-child]:items-stretch">
            <TextField id="ds-name" label="Full name" placeholder="Aarav Menon" required />
            <TextField
              id="ds-email"
              label="Email"
              defaultValue="not-an-email"
              error="Enter a valid email address."
            />
            <SelectField
              id="ds-college"
              label="College"
              hint="Only partner institutions appear here."
              options={[
                { value: "sn", label: "Sree Narayana College" },
                { value: "amrita", label: "Amrita Institute" },
              ]}
            />
          </Specimen>
          <Specimen name="<SearchField> · <Checkbox> · <Switch> · <TextareaField>" className="[&>div:last-child]:flex-col [&>div:last-child]:items-stretch">
            <SearchField id="ds-search" label="Search" placeholder="Search students..." />
            <Checkbox id="ds-terms" label="Notify the trainer" hint="Sends an email on enrolment." />
            <Switch id="ds-active" label="Module enabled" hint="Visible to all tenants." defaultChecked />
            <TextareaField id="ds-notes" label="Notes" placeholder="Internal notes..." />
          </Specimen>
        </div>
      </ShowcaseSection>

      <ShowcaseSection
        id="feedback"
        title="Feedback"
        description="Alert for in-view messages, EmptyState for legitimately empty collections, Skeleton while streaming, Spinner for in-place waits."
      >
        <div className="grid gap-6 md:grid-cols-2">
          <Specimen name="<Alert intent>">
            <div className="flex w-full flex-col gap-3">
              <Alert intent="info" title="Sync scheduled">
                The next tenant sync runs at 02:00 IST.
              </Alert>
              <Alert intent="danger" title="Import failed" action={<Button size="sm">Retry</Button>}>
                14 rows were rejected by validation.
              </Alert>
            </div>
          </Specimen>
          <Specimen name="<EmptyState> · <Skeleton> · <Spinner>">
            <div className="flex w-full flex-col gap-4">
              <EmptyState
                icon="users"
                title="No students match those filters"
                description="Try a broader search term."
                action={<Button size="sm">Clear filters</Button>}
              />
              <SkeletonText lines={2} />
              <Skeleton className="h-10 w-full rounded-full" />
              <span className="flex items-center gap-2 text-ink-muted">
                <Spinner /> Loading batch…
              </span>
            </div>
          </Specimen>
        </div>
      </ShowcaseSection>

      <ShowcaseSection
        id="data"
        title="Data display"
        description="DataTable and DonutChart are generic: describe columns or segments and they render. Do not hand-roll a table."
      >
        <div className="grid gap-6 xl:grid-cols-2">
          <Card padding="none" className="overflow-hidden">
            <CardHeader title="<DataTable columns rows>" className="p-6 pb-4" />
            <DataTable
              caption="Example rows"
              columns={DEMO_COLUMNS}
              rows={DEMO_ROWS}
              getRowId={(row) => row.id}
              minWidth="320px"
            />
          </Card>

          <Card className="flex flex-col gap-6">
            <CardHeader title="<DonutChart> · <ProgressBar>" className="pb-0" />
            <div className="flex flex-wrap items-center gap-8">
              <DonutChart
                size={140}
                thickness={14}
                segments={[
                  { id: "a", label: "South", percentage: 65, color: brandTokens.brand },
                  { id: "b", label: "North", percentage: 25, color: brandTokens.accent },
                  { id: "c", label: "Other", percentage: 10, color: brandTokens.neutral },
                ]}
              >
                <span className="text-metric text-ink">14</span>
              </DonutChart>
              {/* Adding `track` turns the ring into a gauge: the arc is drawn to
                  the value and the remainder stays visible behind it. */}
              <DonutChart
                size={112}
                thickness={8}
                track={brandTokens.neutral}
                ariaLabel={null}
                segments={[
                  { id: "ring", label: "Coverage", percentage: 94, color: brandTokens.accent },
                ]}
              >
                <span className="text-metric-sm text-brand">94%</span>
                <span className="text-overline tracking-[1px] text-ink-muted uppercase">Mapped</span>
              </DonutChart>
              <div className="min-w-56 flex-1 space-y-4">
                <ProgressBar value={88} label="Batch completion" />
                <ProgressBar value={34} label="At-risk cohort" color={feedbackTokens.warning} />
                <div className="space-y-2">
                  <p className="text-caption text-ink-muted">
                    <code className="font-mono">{"<StackedBar>"}</code> — shares that total 100
                  </p>
                  <StackedBar
                    segments={[
                      { id: "s", label: "South", percentage: 65, color: brandTokens.brand },
                      { id: "n", label: "North", percentage: 25, color: brandTokens.accent },
                      { id: "o", label: "Other", percentage: 10, color: brandTokens.neutral },
                    ]}
                  />
                </div>
              </div>
            </div>
          </Card>
        </div>

        <StatTileGrid className="xl:grid-cols-3">
          <StatTile
            label="Students"
            value="3,420"
            caption="Enrolled this term"
            icon="users"
            color={domainTokens.students}
          />
          <StatTile
            label="Trainers"
            value="42"
            caption="Active instructors"
            icon="trainer"
            color={domainTokens.trainers}
          />
          <StatTile
            label="Colleges"
            value="14"
            caption="B2B partners — links through"
            icon="college"
            color={domainTokens.colleges}
            href="/colleges"
          />
        </StatTileGrid>
      </ShowcaseSection>

      <ShowcaseSection
        id="navigation"
        title="Navigation & overlays"
        description="Tabs and pagination are link-based, so every view is deep-linkable and stays server-rendered."
      >
        <div className="grid gap-6 md:grid-cols-2">
          <Specimen name="<Breadcrumbs> · <Pagination>">
            <div className="flex w-full flex-col gap-4">
              <Breadcrumbs
                items={[{ label: "Console", href: "/" }, { label: "Students", href: "/students" }, { label: "Aarav Menon" }]}
              />
              <Pagination
                page={2}
                pageCount={5}
                hrefForPage={(page) =>
                  (page === 1 ? "/design-system" : `/design-system?page=${page}`) as Route
                }
                summary="Showing 9–16 of 38"
              />
            </div>
          </Specimen>
          <Specimen name="<Tooltip> · <Avatar> · <Drawer> · <Dialog>">
            <Tooltip label="Open notifications">
              <Button variant="ghost" size="icon" aria-label="Notifications">
                <Icon name="bell" />
              </Button>
            </Tooltip>
            <Avatar src="/img/avatar-admin.png" name="Admin Global" size="sm" />
            <Avatar src="/img/avatar-admin.png" name="Admin Global" ringColor={domainTokens["question-bank"]} />
            <OverlayDemo />
          </Specimen>
        </div>
      </ShowcaseSection>

      <ShowcaseSection
        id="patterns"
        title="Patterns"
        description="Composed blocks. Reach for these before laying out a page by hand — ListPage, FilterToolbar, StatTileGrid, InsightPanel, SplitLayout."
      >
        <FilterTabs
          param="ds-status"
          tabs={[
            { value: "all", label: "All Countries", count: 12 },
            { value: "active", label: "Active", count: 8 },
            { value: "draft", label: "Draft", count: 3 },
            { value: "archived", label: "Archived", count: 1 },
          ]}
        />

        <FilterToolbar
          search={<SearchField id="ds-toolbar-search" label="Search" placeholder="Search records..." />}
          filters={<Chip variant="outline">Status: Active</Chip>}
          actions={<Button size="sm">Export</Button>}
        />

        <PromoBanner
          description="Manage active operating countries, dial codes and regional currency formatting across all partner institutions."
          action={
            <Button>
              <Icon name="plus" />
              Add New Country
            </Button>
          }
          illustration={{
            src: "/img/illus-country-management.png",
            alt: "Country management workspace preview",
            width: 512,
            height: 279,
          }}
        />
        <div className="grid gap-6 lg:grid-cols-2">
          <InsightPanel
            id="ds-brand"
            tone="brand"
            eyebrow="Performance Metrics"
            title="Course & Batch Schedule Performance"
            metric="88.4%"
            description="Average completion rate across all enterprise batches."
          />
          <InsightPanel
            id="ds-accent"
            tone="accent"
            eyebrow="AI Generation"
            title="Question Bank & AI Variant Generation"
            metric="94%"
            description="Model accuracy for adaptive difficulty scaling."
          />
        </div>
      </ShowcaseSection>
    </PageBody>
  );
}
