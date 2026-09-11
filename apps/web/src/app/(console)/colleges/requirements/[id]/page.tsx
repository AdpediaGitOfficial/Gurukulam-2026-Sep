import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { Alert } from "@/components/ui/alert";
import { Card, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { StatusPill } from "@/components/ui/status-pill";
import { ConfirmRequirementForm } from "@/features/requirements/components/confirm-requirement-form";
import { getRequirement } from "@/features/requirements/server/requirements-service";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";
import { cn } from "@/lib/cn";
import { formatCount } from "@/lib/format";

export const metadata: Metadata = { title: "Requirement" };

const STATUS: Record<string, { intent: "success" | "info" | "warning" | "danger" | "neutral"; label: string }> = {
  NEW: { intent: "neutral", label: "New" },
  UNDER_REVIEW: { intent: "info", label: "Under review" },
  CONFIRMED: { intent: "success", label: "Confirmed" },
  REJECTED: { intent: "danger", label: "Rejected" },
  FULFILLED: { intent: "success", label: "Fulfilled" },
};

const MODE = { ONLINE: "Online", OFFLINE: "Offline", HYBRID: "Hybrid" } as const;

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-hairline py-3 last:border-b-0">
      <dt className="text-body-sm text-ink-subtle">{label}</dt>
      <dd className="text-right text-body-sm font-medium text-ink">{value}</dd>
    </div>
  );
}

/**
 * Where this ask currently sits.
 *
 * A requirement is a conversation with an institution, not a row: raised →
 * answered → delivered. Showing the chain is what makes "what came of this?"
 * answerable at a glance.
 */
function Pipeline({ status }: { status: string }) {
  const answered = status !== "NEW" && status !== "UNDER_REVIEW";
  const confirmed = status === "CONFIRMED" || status === "FULFILLED";

  const steps = [
    { label: "Raised", done: true },
    { label: "Answered", done: answered },
    { label: "Batch created", done: confirmed },
    { label: "Delivered", done: status === "FULFILLED" },
  ];

  return (
    <ol className="flex flex-wrap gap-2">
      {steps.map((step, index) => (
        <li
          key={step.label}
          className={cn(
            "flex min-w-40 flex-1 items-center gap-3 rounded-well border p-3.5",
            step.done ? "border-hairline bg-surface" : "border-hairline bg-surface-sunken",
          )}
        >
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-full text-caption font-bold",
              step.done ? "bg-success text-white" : "bg-surface-muted text-ink-subtle",
            )}
          >
            {step.done ? <Icon name="check" size={14} /> : index + 1}
          </span>
          <span className={cn("text-body-sm font-semibold", step.done ? "text-ink" : "text-ink-subtle")}>
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default async function RequirementDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("requirements");
  const { id } = await params;
  const query = await searchParams;
  const requirement = await getRequirement(id);

  const status = STATUS[requirement.status] ?? { intent: "neutral" as const, label: requirement.status };
  const open = requirement.status === "NEW" || requirement.status === "UNDER_REVIEW";

  const dateRange =
    requirement.preferredWindowStart === null
      ? "No window given"
      : `${new Date(requirement.preferredWindowStart).toLocaleDateString("en-IN")}${
          requirement.preferredWindowEnd === null
            ? " onwards"
            : ` – ${new Date(requirement.preferredWindowEnd).toLocaleDateString("en-IN")}`
        }`;

  return (
    <PageBody>
      <PageHeader
        eyebrow="Colleges"
        title={requirement.courseName ?? "Training requirement"}
        description={`${requirement.requirementCode} · ${requirement.collegeName ?? "—"}`}
        breadcrumbs={[
          { label: "Colleges", href: "/colleges" },
          { label: "Requirements", href: "/colleges/requirements" },
          { label: requirement.requirementCode },
        ]}
      />

      {query["confirmed"] === "1" ? (
        <Alert intent="success" title="Confirmed">
          The dedicated batch has been created. It carries this college&rsquo;s students only.
        </Alert>
      ) : null}
      {query["rejected"] === "1" ? (
        <Alert intent="info" title="Turned down">
          The reason is on the record, so the college can revise the ask.
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <StatusPill intent={status.intent}>{status.label}</StatusPill>
        <span className="text-body-sm text-ink-muted">
          raised {new Date(requirement.createdAt).toLocaleDateString("en-IN")}
        </span>
      </div>

      <Pipeline status={requirement.status} />

      <div className="grid gap-8 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader as="h2" title="What was asked for" />
          <dl>
            <Row label="College" value={requirement.collegeName ?? "—"} />
            <Row label="Course" value={requirement.courseName ?? "—"} />
            <Row
              label="Headcount"
              value={<span className="tabular-nums">{formatCount(requirement.expectedHeadcount)}</span>}
            />
            <Row label="Preferred mode" value={MODE[requirement.preferredMode]} />
            <Row label="Window" value={dateRange} />
            <Row label="Discipline" value={requirement.discipline ?? "—"} />
            {requirement.notes === null ? null : <Row label="Notes" value={requirement.notes} />}
          </dl>
        </Card>

        <div className="xl:col-span-2">
          {open ? (
            <ConfirmRequirementForm requirement={requirement} />
          ) : (
            <Card>
              <CardHeader
                as="h2"
                title="Already answered"
                description="A requirement is answered once. What came of it is below."
              />
              <dl>
                <Row label="Status" value={status.label} />
                {requirement.confirmedAt === null ? null : (
                  <Row
                    label="Confirmed"
                    value={new Date(requirement.confirmedAt).toLocaleString("en-IN")}
                  />
                )}
                {requirement.rejectionReason === null ? null : (
                  <Row label="Reason" value={requirement.rejectionReason} />
                )}
                <Row
                  label="Batch produced"
                  value={
                    requirement.batchId === null ? (
                      <span className="text-ink-subtle">None</span>
                    ) : (
                      <Link
                        href={`/batches?q=${requirement.batchCode ?? ""}`}
                        className="font-mono text-brand underline-offset-4 hover:underline"
                      >
                        {requirement.batchCode ?? "View batch"}
                      </Link>
                    )
                  }
                />
              </dl>
            </Card>
          )}
        </div>
      </div>
    </PageBody>
  );
}
