import type { Metadata } from "next";
import Link from "next/link";
import { can } from "@gurukulam/contracts";
import type { AssignmentSubmission } from "@gurukulam/contracts";

import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { PageHeader } from "@/components/patterns/page-header";
import { PageBody, PageSection } from "@/components/patterns/page-section";
import { StatTile, StatTileGrid } from "@/components/patterns/stat-tile";
import { MarkSubmission } from "@/features/batches/components/mark-submission";
import { getAssignment, listAssignmentSubmissions } from "@/features/batches/server/batches-service";
import { requireModule } from "@/server/principal";
import { brandTokens, feedbackTokens } from "@/design-system/tokens";
import { formatCount } from "@/lib/format";

export const metadata: Metadata = { title: "Assignment" };

/**
 * One assignment, what has been handed in, and the marking.
 *
 * ── The screen this console did not have ───────────────────────────────
 *
 * An assignment row offered Edit and Delete and nothing else. An operator could
 * not see a single submission — could not answer "has anybody handed this in" —
 * and could not mark: `POST /batches/submissions/:id/grade` was reachable only
 * from the trainer portal. That breaks the rule the whole product is arranged
 * around, and it breaks it on the one thing a student chases. A trainer released
 * mid-cohort, a trainer who never marks, a disputed grade: all of them need
 * somebody else able to act.
 *
 * ── Why the work is on the page ────────────────────────────────────────
 *
 * `content_text` is where most answers arrive — there is no file storage yet —
 * and it was in no contract but the student's own. Marking work you cannot read
 * is not marking, which is the real reason neither this screen nor the trainer's
 * existed for as long as they did not.
 */
export default async function AssignmentPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const principal = await requireModule("batches");
  const mayGrade = can(principal, "batches", "edit");
  const { assignmentId } = await params;

  const [assignment, submissions] = await Promise.all([
    getAssignment(assignmentId),
    listAssignmentSubmissions(assignmentId),
  ]);

  const handedIn = submissions.filter((row) => row.submittedAt !== null);
  const marked = handedIn.filter((row) => row.gradedAt !== null);
  const waiting = handedIn.filter((row) => row.gradedAt === null);
  /* Rows that exist and carry no submission: allocation creates one per student
     per assignment, so this is the difference between "not handed in" and "not on
     the roster" — and only the first is a row here at all. */
  const outstanding = submissions.filter((row) => row.submittedAt === null);

  return (
    <PageBody>
      <PageHeader
        eyebrow="Assignments"
        title={assignment.title}
        description={[
          assignment.assignmentCode,
          assignment.dueAt === null ? null : `due ${assignment.dueAt.slice(0, 10)}`,
          assignment.maxMarks === null ? "no maximum" : `out of ${assignment.maxMarks}`,
        ]
          .filter(Boolean)
          .join(" · ")}
        breadcrumbs={[
          { label: "Batches", href: "/batches" },
          ...(assignment.sessionId === null
            ? []
            : [{ label: "Session", href: `/batches/sessions/${assignment.sessionId}` }]),
          { label: assignment.title },
        ]}
        action={
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Link
              href={`/batches/assignments/${assignment.assignmentId}/edit`}
              className={buttonVariants({ variant: "secondary" })}
            >
              Edit assignment
            </Link>
          </div>
        }
      />

      {assignment.status === "DRAFT" ? (
        <Alert intent="info" title="This assignment is a draft">
          Students cannot see it and nothing can be handed in against it yet.
        </Alert>
      ) : null}

      <StatTileGrid>
        <StatTile
          label="Handed in"
          value={formatCount(handedIn.length)}
          caption={`Of ${formatCount(submissions.length)} on the roster`}
          icon="task"
          color={brandTokens.brand}
        />
        {/* Colour spent on the two that are work outstanding. A tile row where
            every tile is coloured is one where none of them is. */}
        <StatTile
          label="Waiting to be marked"
          value={formatCount(waiting.length)}
          caption="Handed in, not graded"
          icon="pencil"
          color={waiting.length > 0 ? feedbackTokens.warning : brandTokens.brand}
        />
        <StatTile
          label="Marked"
          value={formatCount(marked.length)}
          caption="The student can read it"
          icon="check"
          color={feedbackTokens.success}
        />
        <StatTile
          label="Not handed in"
          value={formatCount(outstanding.length)}
          caption="Nothing submitted yet"
          icon="clock"
          color={outstanding.length > 0 ? feedbackTokens.warning : brandTokens.brand}
        />
      </StatTileGrid>

      <PageSection
        title={`Handed in${handedIn.length === 0 ? "" : ` — ${formatCount(handedIn.length)}`}`}
        description={
          mayGrade
            ? "The student reads the mark and the feedback on their portal."
            : "Read-only: marking needs edit permission on batches."
        }
      >
        {handedIn.length === 0 ? (
          <Card>
            <EmptyState
              title="Nothing handed in yet"
              description="Submissions appear here as students hand them in, with whatever they wrote or linked."
            />
          </Card>
        ) : (
          <ul className="flex flex-col gap-4">
            {handedIn.map((submission) => (
              <li key={submission.submissionId}>
                <SubmissionCard
                  submission={submission}
                  assignmentId={assignment.assignmentId}
                  mayGrade={mayGrade}
                />
              </li>
            ))}
          </ul>
        )}
      </PageSection>

      {/* Who has NOT handed in, because that is the list somebody chases — and
          it is a list of rows that already exist rather than an absence to be
          inferred from the roster. */}
      {outstanding.length === 0 ? null : (
        <PageSection
          title={`Not handed in — ${formatCount(outstanding.length)}`}
          description="These students have the assignment and have submitted nothing."
        >
          <Card padding="none">
            <ul className="flex flex-col divide-y divide-hairline">
              {outstanding.map((row) => (
                <li
                  key={row.submissionId}
                  className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-4"
                >
                  <span className="min-w-0">
                    <span className="text-body font-semibold break-words text-ink">
                      {row.studentName ?? "A student"}
                    </span>
                    <span className="ml-2 font-mono text-caption text-ink-subtle">
                      {row.studentCode ?? ""}
                    </span>
                  </span>
                  <StatusPill intent="neutral">{row.status.toLowerCase()}</StatusPill>
                </li>
              ))}
            </ul>
          </Card>
        </PageSection>
      )}
    </PageBody>
  );
}

function SubmissionCard({
  submission,
  assignmentId,
  mayGrade,
}: {
  submission: AssignmentSubmission;
  assignmentId: string;
  mayGrade: boolean;
}) {
  const marked = submission.gradedAt !== null;

  return (
    <Card>
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <Link
              href={`/students/${submission.studentId}`}
              className="text-body font-semibold break-words text-ink hover:underline"
            >
              {submission.studentName ?? "A student"}
            </Link>
            <p className="font-mono text-caption text-ink-subtle">
              {submission.studentCode ?? ""}
              {submission.submittedAt === null
                ? ""
                : ` · handed in ${submission.submittedAt.slice(0, 10)}`}
            </p>
          </div>
          {marked ? (
            <StatusPill intent="success">
              {submission.marksAwarded === null
                ? "feedback given"
                : `${submission.marksAwarded}${submission.maxMarks === null ? "" : ` / ${submission.maxMarks}`}`}
            </StatusPill>
          ) : (
            <StatusPill intent="warning">to mark</StatusPill>
          )}
        </div>

        {/* The work. Pre-wrapped, because a student's answer has their own line
            breaks in it and collapsing them changes what they wrote. */}
        {submission.contentText === null && submission.fileUrl === null ? (
          <p className="text-body-sm text-ink-subtle">
            They handed in without writing anything or attaching a link.
          </p>
        ) : (
          <div className="flex min-w-0 flex-col gap-2 rounded-well bg-surface-sunken p-4">
            {submission.contentText === null ? null : (
              <p className="min-w-0 break-words whitespace-pre-wrap text-body-sm text-ink">
                {submission.contentText}
              </p>
            )}
            {submission.fileUrl === null ? null : (
              <a
                href={submission.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-fit min-w-0 break-all text-body-sm font-medium text-brand underline-offset-4 hover:underline"
              >
                {submission.fileUrl}
              </a>
            )}
          </div>
        )}

        {/* Whose mark is being replaced, named before it is replaced. */}
        {marked ? (
          <p className="text-caption text-ink-subtle">
            Marked
            {submission.gradedByName === null ? "" : ` by ${submission.gradedByName}`}
            {submission.gradedAt === null ? "" : ` on ${submission.gradedAt.slice(0, 10)}`}
          </p>
        ) : null}

        {mayGrade ? (
          <MarkSubmission submission={submission} assignmentId={assignmentId} />
        ) : submission.feedback === null ? null : (
          <p className="text-body-sm text-ink-muted">{submission.feedback}</p>
        )}
      </div>
    </Card>
  );
}
