import type { Metadata } from "next";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { CampusCard, CampusField, CampusPage } from "@/features/campus/components/campus-page";
import { REQUIREMENT_STATE, campusDate } from "@/features/campus/format";
import { listRequirements } from "@/features/campus/server/campus-service";
import { requireCollegeUser } from "@/server/principal";

export const metadata: Metadata = { title: "Requirements — Gurukulam" };

const MODE: Record<string, string> = { ONLINE: "Online", OFFLINE: "On campus", HYBRID: "Hybrid" };

/**
 * What the college has asked us for.
 *
 * ── Why the status is a sentence ───────────────────────────────────────
 *
 * The console shows `NEW` and `UNDER_REVIEW` because an operator knows the
 * workflow those words belong to. A TPO reading "NEW" learns nothing about
 * whether they are waiting on us or we are waiting on them — which is the only
 * thing they opened this screen to find out. `REQUIREMENT_STATE` answers that,
 * in the second person.
 *
 * ── Why a declined one is not hidden ───────────────────────────────────
 *
 * With its reason. A request that quietly disappears is one somebody raises
 * again next term, and the reason we could not take it on is the thing that
 * stops that.
 */
export default async function CampusRequirementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireCollegeUser();
  const [requirements, query] = await Promise.all([listRequirements(), searchParams]);

  return (
    <CampusPage
      eyebrow="Requirements"
      title="What you have asked for"
      description="Every request, and whose turn it is."
      action={
        <Link href="/campus/requirements/new" className={buttonVariants({ size: "md" })}>
          Raise a requirement
        </Link>
      }
    >
      {query["raised"] === "1" ? (
        <Alert intent="success" title="Request received">
          It is with us now. We will come back to you with dates and a trainer — you do not need to
          chase it.
        </Alert>
      ) : null}

      {requirements.length === 0 ? (
        <CampusCard>
          <EmptyState
            title="Nothing asked for yet"
            description="Tell us the course, roughly how many students, and when you would like it to run. We come back with dates and a trainer."
            action={
              <Link href="/campus/requirements/new" className={buttonVariants({ variant: "secondary" })}>
                Raise a requirement
              </Link>
            }
          />
        </CampusCard>
      ) : (
        <div className="flex flex-col gap-4">
          {requirements.map((requirement) => {
            const state = REQUIREMENT_STATE[requirement.status] ?? {
              label: requirement.status.toLowerCase().replace(/_/g, " "),
              detail: "",
              waiting: false,
            };
            return (
              <CampusCard key={requirement.requirementId}>
                <div className="flex min-w-0 flex-col gap-4">
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <p className="text-body font-semibold break-words text-ink">
                        {requirement.courseName ?? "A course"}
                      </p>
                      <p className="font-mono text-caption text-ink-subtle">
                        {requirement.requirementCode}
                      </p>
                    </div>
                    <StatusPill
                      intent={
                        requirement.status === "REJECTED"
                          ? "danger"
                          : requirement.status === "CONFIRMED" || requirement.status === "FULFILLED"
                            ? "success"
                            : "info"
                      }
                    >
                      {state.label}
                    </StatusPill>
                  </div>

                  {state.detail === "" ? null : (
                    <p className="text-body-sm text-ink-muted">{state.detail}</p>
                  )}

                  <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <CampusField label="Students" value={requirement.expectedHeadcount} />
                    <CampusField
                      label="Delivery"
                      value={MODE[requirement.preferredMode] ?? requirement.preferredMode}
                    />
                    <CampusField
                      label="Window"
                      value={
                        requirement.preferredWindowStart === null
                          ? null
                          : `${campusDate(requirement.preferredWindowStart)}${
                              requirement.preferredWindowEnd === null
                                ? ""
                                : ` → ${campusDate(requirement.preferredWindowEnd)}`
                            }`
                      }
                    />
                    <CampusField label="Raised" value={campusDate(requirement.createdAt)} />
                  </dl>

                  {/* The batch a confirmation produced (invariant 14). It is the
                      answer to "you said yes — where is it?", and the schedule
                      is where that cohort's days live. */}
                  {requirement.batchCode === null || requirement.batchCode === undefined ? null : (
                    <p className="text-body-sm text-ink-muted">
                      Running as{" "}
                      <span className="font-mono text-caption text-ink">{requirement.batchCode}</span>
                      {" — "}
                      <Link
                        href="/campus/schedule"
                        className="font-medium text-brand underline-offset-4 hover:underline"
                      >
                        see its sessions
                      </Link>
                    </p>
                  )}

                  {requirement.status === "REJECTED" && requirement.rejectionReason !== null ? (
                    <p className="rounded-well bg-danger/5 p-3 text-body-sm text-danger">
                      {requirement.rejectionReason}
                    </p>
                  ) : null}
                </div>
              </CampusCard>
            );
          })}
        </div>
      )}
    </CampusPage>
  );
}
