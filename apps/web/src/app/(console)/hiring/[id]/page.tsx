import type { Metadata } from "next";
import Link from "next/link";
import { formatRupees, fromWire } from "@gurukulam/contracts";

import { ConfirmAction } from "@/components/patterns/confirm-with-reason";
import { PageHeader } from "@/components/patterns/page-header";
import { PageBody, PageSection } from "@/components/patterns/page-section";
import { StatTile, StatTileGrid } from "@/components/patterns/stat-tile";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { closeJob, publishJob } from "@/features/hiring/server/actions";
import { getJob } from "@/features/hiring/server/hiring-service";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";
import { brandTokens, domainTokens, feedbackTokens } from "@/design-system/tokens";
import { formatCount } from "@/lib/format";

export const metadata: Metadata = { title: "Job posting" };

const STATUS = {
  DRAFT: { intent: "neutral", label: "Draft" },
  PUBLISHED: { intent: "success", label: "Published" },
  CLOSED: { intent: "warning", label: "Closed" },
  ARCHIVED: { intent: "neutral", label: "Archived" },
} as const;

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("hiring");
  const { id } = await params;
  const query = await searchParams;
  const job = await getJob(id);

  const rules = job.audienceRules ?? [];
  const reach = job.reach ?? 0;
  const status = STATUS[job.status];

  return (
    <PageBody>
      <PageHeader
        eyebrow={job.jobCode}
        title={job.roleTitle}
        description={[job.companyName, job.location, job.workMode.toLowerCase()]
          .filter(Boolean)
          .join(" · ")}
        breadcrumbs={[{ label: "Hiring", href: "/hiring" }, { label: job.roleTitle }]}
        action={
          job.status === "DRAFT" ? (
            <ConfirmAction
              action={publishJob.bind(null, job.jobPostingId)}
              label={reach === 0 ? "Publish anyway" : `Publish to ${formatCount(reach)}`}
              pending="Publishing…"
              subject={job.roleTitle}
              variant="primary"
              size="md"
            />
          ) : job.status === "PUBLISHED" ? (
            <ConfirmAction
              action={closeJob.bind(null, job.jobPostingId)}
              label="Close posting"
              pending="Closing…"
              subject={job.roleTitle}
            />
          ) : undefined
        }
      />

      {query["created"] === "1" ? (
        <Alert intent="success" title="Saved as a draft">
          Nobody can see it yet. Check the reach below, then publish.
        </Alert>
      ) : query["published"] === "1" ? (
        <Alert intent="success" title="Published">
          Every student the rules match can see it — including those who enrol later, because the
          audience is worked out when the posting is read.
        </Alert>
      ) : query["closed"] === "1" ? (
        <Alert intent="info" title="Closed">
          It reaches nobody now. The record stays.
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <StatusPill intent={status.intent}>{status.label}</StatusPill>
        {job.source === "INTERNAL" ? null : <Chip>from {job.source.toLowerCase()}</Chip>}
        {job.skills.map((skill) => (
          <Chip key={skill}>{skill}</Chip>
        ))}
      </div>

      <StatTileGrid>
        <StatTile
          label="Reaches"
          value={formatCount(reach)}
          caption={
            rules.length === 0
              ? "No audience rule — nobody sees it"
              : "Worked out on every read, never stored"
          }
          icon="users"
          color={reach === 0 ? feedbackTokens.warning : domainTokens.students}
        />
        <StatTile
          label="Audience rules"
          value={formatCount(rules.length)}
          caption="Course is the axis; the rest narrows it"
          icon="filter"
          color={domainTokens.courses}
        />
        <StatTile
          label="Compensation"
          value={
            job.compensationMinMinor === null
              ? "—"
              : formatRupees(fromWire(job.compensationMinMinor), { paise: false })
          }
          caption={
            job.compensationMaxMinor === null
              ? (job.compensationPeriod?.toLowerCase() ?? "Not stated")
              : `up to ${formatRupees(fromWire(job.compensationMaxMinor), { paise: false })} ${job.compensationPeriod?.toLowerCase() ?? ""}`
          }
          icon="rupee"
          color={brandTokens.gold}
        />
        <StatTile
          label="Closes"
          value={job.closingDate === null ? "Open" : job.closingDate.slice(0, 10)}
          caption={job.publishedAt === null ? "Not published yet" : `Published ${job.publishedAt.slice(0, 10)}`}
          icon="cal"
          color={brandTokens.brand}
        />
      </StatTileGrid>

      {job.description === null ? null : (
        <Card>
          <p className="max-w-3xl text-body whitespace-pre-line text-ink-muted">
            {job.description}
          </p>
        </Card>
      )}

      <PageSection
        title="Who sees it"
        description="Evaluated when the posting is read, so a student who enrols tomorrow and matches these rules sees it tomorrow."
      >
        {rules.length === 0 ? (
          <Card>
            <EmptyState
              title="No audience rule"
              description="Nobody can see this posting. Every rule starts from a course — that is the question a recruiter is really asking."
            />
          </Card>
        ) : (
          <Card padding="none" className="overflow-hidden">
            <ul className="flex flex-col">
              {rules.map((rule) => (
                <li
                  key={rule.ruleId}
                  className="flex flex-wrap items-center gap-3 border-b border-hairline p-4 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 text-body text-ink">
                    Students who took{" "}
                    <span className="font-semibold">{rule.courseName ?? "a course"}</span>
                  </span>
                  {rule.completedOnly ? <Chip>completed only</Chip> : null}
                  {rule.segment === null ? null : <Chip>{rule.segment.toLowerCase()}</Chip>}
                  {rule.passoutYear === null ? null : <Chip>passout {rule.passoutYear}</Chip>}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </PageSection>

      {job.applyUrl === null && job.applyEmail === null ? null : (
        <PageSection title="How to apply" hideTitle>
          <Card className="flex flex-wrap items-center gap-4">
            <span className="text-body-sm text-ink-muted">Apply</span>
            {job.applyUrl === null ? null : (
              <a href={job.applyUrl} className="text-body text-gold underline-offset-4 hover:underline">
                {job.applyUrl}
              </a>
            )}
            {job.applyEmail === null ? null : (
              <a
                href={`mailto:${job.applyEmail}`}
                className="text-body text-gold underline-offset-4 hover:underline"
              >
                {job.applyEmail}
              </a>
            )}
          </Card>
        </PageSection>
      )}

      <p className="text-body-sm text-ink-muted">
        <Link href="/hiring" className="text-gold underline-offset-4 hover:underline">
          Back to Hiring
        </Link>
      </p>
    </PageBody>
  );
}
