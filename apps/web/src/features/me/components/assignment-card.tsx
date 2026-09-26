import type { MeAssignment } from "@gurukulam/contracts";

import { Icon } from "@/components/ui/icon";
import { StatusPill } from "@/components/ui/status-pill";
import { HandInForm } from "@/features/me/components/hand-in-form";
import { PortalCard } from "@/features/me/components/portal-page";
import { portalDate } from "@/features/me/format";

/**
 * One piece of work, as the student who has to do it reads it.
 *
 * ── One card, three situations ──────────────────────────────────────────
 *
 * Still to do, handed in, and the window closed on it. They share a component
 * because they are the same facts in a different tense — a student who learned
 * to read one should not have to learn the other — and because the difference
 * between them is exactly one question: is there still something to do.
 *
 * ── Why a marked assignment shows the mark before the work ──────────────
 *
 * Once a trainer has written a mark, that IS the answer to why the student
 * opened the card. The link they submitted is still there, under it, because
 * the mark means nothing without the thing it was given for.
 */
export function AssignmentCard({
  assignment,
  confirmed = false,
}: {
  assignment: MeAssignment;
  /** Just handed in, this request. Shown as a line on the card, not a banner. */
  confirmed?: boolean;
}) {
  const submission = assignment.submission;
  const handedIn = submission?.submittedAt != null;
  const graded = submission?.gradedAt != null;

  return (
    <PortalCard className={assignment.overdue ? "border-danger/30" : undefined}>
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className="min-w-0 text-body font-semibold break-words text-ink">
              {assignment.title}
            </h3>
            <Status assignment={assignment} />
          </div>
          <p className="text-caption text-ink-subtle">
            <span className="font-mono">{assignment.assignmentCode}</span> ·{" "}
            <span className="font-mono">{assignment.batchCode}</span>
            {assignment.courseName === null ? "" : ` · ${assignment.courseName}`}
            {assignment.sessionTitle === null ? "" : ` · ${assignment.sessionTitle}`}
          </p>
        </div>

        <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Meta icon="cal">
            {assignment.dueAt === null ? (
              "No due date"
            ) : (
              <span className={assignment.overdue ? "font-medium text-danger" : undefined}>
                {assignment.overdue ? "Was due " : "Due "}
                {portalDate(assignment.dueAt)}
              </span>
            )}
          </Meta>
          {assignment.maxMarks === null ? null : (
            <Meta icon="seal">Out of {assignment.maxMarks}</Meta>
          )}
        </ul>

        {assignment.description === null ? null : (
          <p className="text-body-sm break-words whitespace-pre-line text-ink-muted">
            {assignment.description}
          </p>
        )}

        {assignment.instructions === null ? null : (
          <div className="rounded-well bg-surface-soft p-3">
            <p className="text-overline text-ink-subtle uppercase">What to do</p>
            <p className="mt-1 text-body-sm break-words whitespace-pre-line text-ink">
              {assignment.instructions}
            </p>
          </div>
        )}

        {assignment.attachmentUrl === null ? null : (
          <a
            href={assignment.attachmentUrl}
            className="flex w-fit items-center gap-2 text-body-sm font-medium text-brand underline-offset-4 hover:underline"
          >
            <Icon name="down" size={18} />
            Open the brief
          </a>
        )}

        {/* ── What the student handed in ──────────────────────────────── */}
        {handedIn && submission !== null ? (
          <div className="flex min-w-0 flex-col gap-2 border-t border-hairline pt-4">
            {graded ? (
              <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-metric-sm tabular-nums text-success-strong">
                  {submission.marksAwarded ?? "—"}
                  {assignment.maxMarks === null ? "" : ` / ${assignment.maxMarks}`}
                </span>
                <span className="text-body-sm text-ink-muted">
                  Marked {portalDate(submission.gradedAt!)}
                </span>
              </p>
            ) : (
              /* Said plainly, because the alternative reading of a handed-in
                 card with no mark on it is "they lost it". */
              <p className="text-body-sm text-ink-muted">
                Handed in {portalDate(submission.submittedAt!)}. Not marked yet — your trainer
                writes the mark and any feedback here.
              </p>
            )}

            {submission.feedback === null ? null : (
              <p className="rounded-well bg-surface-soft p-3 text-body-sm break-words whitespace-pre-line text-ink">
                {submission.feedback}
              </p>
            )}

            {submission.fileUrl === null ? null : (
              <a
                href={submission.fileUrl}
                className="flex w-fit min-w-0 items-center gap-2 text-body-sm font-medium text-brand underline-offset-4 hover:underline"
              >
                <Icon name="eye" size={18} className="shrink-0" />
                <span className="min-w-0 break-all">{submission.fileUrl}</span>
              </a>
            )}

            {submission.contentText === null ? null : (
              <p className="text-body-sm break-words whitespace-pre-line text-ink">
                {submission.contentText}
              </p>
            )}

            {confirmed ? (
              <p className="flex items-center gap-2 text-body-sm font-medium text-success-strong">
                <Icon name="check" size={18} className="shrink-0" />
                That is in. Your trainer can see it.
              </p>
            ) : null}
          </div>
        ) : null}

        {/* ── The verb, where there still is one ──────────────────────── */}
        {assignment.open && !graded ? (
          <HandInForm
            assignmentId={assignment.assignmentId}
            submitted={handedIn}
            defaults={{
              fileUrl: submission?.fileUrl ?? null,
              contentText: submission?.contentText ?? null,
            }}
          />
        ) : !assignment.open && !handedIn ? (
          /* No verb, and a reason. A closed assignment with a disabled button
             on it is a control that does nothing; a sentence is an answer. */
          <p className="text-body-sm text-ink-subtle">
            This closed without anything handed in. Speak to your trainer if you think that is
            wrong.
          </p>
        ) : null}
      </div>
    </PortalCard>
  );
}

function Status({ assignment }: { assignment: MeAssignment }) {
  const submission = assignment.submission;
  const handedIn = submission?.submittedAt != null;

  if (submission?.gradedAt != null) return <StatusPill intent="success">marked</StatusPill>;
  if (handedIn) {
    return submission!.status === "LATE" ? (
      <StatusPill intent="warning">handed in late</StatusPill>
    ) : (
      <StatusPill intent="info">handed in</StatusPill>
    );
  }
  if (assignment.overdue) return <StatusPill intent="danger">overdue</StatusPill>;
  if (!assignment.open) return <StatusPill intent="neutral">not handed in</StatusPill>;
  return <StatusPill intent="info">to do</StatusPill>;
}

function Meta({ icon, children }: { icon: "cal" | "seal"; children: React.ReactNode }) {
  return (
    <li className="flex min-w-0 items-center gap-1.5 text-body-sm text-ink-muted">
      <Icon name={icon} size={16} className="shrink-0 text-ink-subtle" />
      <span className="min-w-0 break-words">{children}</span>
    </li>
  );
}
