import type { MeJob } from "@gurukulam/contracts";

import { buttonVariants } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { PortalCard } from "@/features/me/components/portal-page";
import { portalDate } from "@/features/me/format";
import { payBand } from "@/features/me/money";

const MODE: Record<MeJob["workMode"], string> = {
  ONSITE: "On site",
  REMOTE: "Remote",
  HYBRID: "Hybrid",
};

/** Remote is a way of working, on site is a place. The icon says which first. */
const MODE_ICON: Record<MeJob["workMode"], IconName> = {
  ONSITE: "college",
  REMOTE: "globe",
  HYBRID: "globe",
};

/**
 * One opening.
 *
 * ── Why "matched on" is on the card and not in the page's preamble ──────
 *
 * Because it differs per posting, and that is the whole information. A banner
 * saying "these are matched to you" is a claim; "matched on Data Analytics,
 * which you have finished" is a reason the student can check — and, when the
 * next posting does not appear, the thing that tells them why.
 *
 * ── Why the verb is a link and says "listing" ───────────────────────────
 *
 * There is no application table, so the portal cannot know whether a student
 * applied. "Apply" would imply it did. "Open the listing" describes exactly
 * what pressing it does, and the sentence under the list says the rest.
 */
export function JobCard({ job }: { job: MeJob }) {
  const pay = payBand(job.compensationMinMinor, job.compensationMaxMinor, job.compensationPeriod);
  const experience = experienceOf(job);

  return (
    <PortalCard>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="min-w-0 text-body font-semibold break-words text-ink">{job.roleTitle}</h3>
          {pay === null ? null : (
            <span className="text-body font-semibold tabular-nums text-success-strong">{pay}</span>
          )}
        </div>

        <p className="min-w-0 text-body-sm break-words text-ink-muted">
          <span className="font-medium text-ink">{job.companyName}</span>
          {job.location === null ? "" : ` · ${job.location}`}
        </p>

        <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Meta icon={MODE_ICON[job.workMode]}>{MODE[job.workMode]}</Meta>
          {experience === null ? null : <Meta icon="brief">{experience}</Meta>}
          {job.closingDate === null ? null : (
            <Meta icon="cal">Closes {portalDate(job.closingDate)}</Meta>
          )}
        </ul>

        {job.description === null ? null : (
          <p className="text-body-sm break-words whitespace-pre-line text-ink-muted">
            {job.description}
          </p>
        )}

        {job.skills.length === 0 ? null : (
          <ul className="flex flex-wrap gap-2">
            {job.skills.map((skill) => (
              <li
                key={skill}
                className="rounded-chip bg-surface-muted px-2.5 py-1 text-caption text-ink-muted"
              >
                {skill}
              </li>
            ))}
          </ul>
        )}

        {/* The reason, set apart from the facts about the job: it is a fact
            about the READER, and reads as an aside rather than a requirement. */}
        <p className="border-t border-hairline pt-3 text-body-sm text-ink-subtle">
          {job.publishedAt === null ? "" : `Posted ${portalDate(job.publishedAt)} · `}
          Matched on {job.matchedOn.join("; ")}
        </p>

        {job.applyUrl === null && job.applyEmail === null ? (
          /* A posting with no way to reach it is a data problem, not a screen
             to leave blank — the student is told where to go instead of being
             shown a card that quietly does nothing. */
          <p className="text-body-sm text-ink-subtle">
            No link was given for this one. The office can put you in touch.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {job.applyUrl === null ? null : (
              <a
                href={job.applyUrl}
                rel="noopener noreferrer"
                target="_blank"
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                Open the listing
              </a>
            )}
            {job.applyEmail === null ? null : (
              <a
                href={`mailto:${job.applyEmail}`}
                className="text-body-sm font-medium text-brand underline-offset-4 hover:underline"
              >
                {job.applyEmail}
              </a>
            )}
          </div>
        )}
      </div>
    </PortalCard>
  );
}

function Meta({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <li className="flex min-w-0 items-center gap-1.5 text-body-sm text-ink-muted">
      <Icon name={icon} size={16} className="shrink-0 text-ink-subtle" />
      <span className="min-w-0 break-words">{children}</span>
    </li>
  );
}

/**
 * "0–2 years", and never "0 years".
 *
 * A minimum of zero is the useful half of a fresher posting and reads as
 * nothing at all on its own, so it is only shown when there is a maximum to
 * bound it. One end alone is stated as the bound it actually is.
 */
function experienceOf(job: MeJob): string | null {
  const { experienceMinYears: min, experienceMaxYears: max } = job;
  if (min === null && max === null) return null;
  if (min !== null && max !== null) {
    return min === max ? `${min} years` : `${min}–${max} years`;
  }
  if (max !== null) return `up to ${max} years`;
  return min === 0 ? "No experience needed" : `${min}+ years`;
}
