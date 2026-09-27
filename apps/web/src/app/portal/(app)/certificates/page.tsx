import type { Metadata } from "next";
import type { MeBatch } from "@gurukulam/contracts";

import { EmptyState } from "@/components/ui/empty-state";
import { CertificateCard } from "@/features/me/components/certificate-card";
import { PortalCard, PortalPage } from "@/features/me/components/portal-page";
import { getCertificates } from "@/features/me/server/me-service";
import { requireStudent } from "@/server/principal";

export const metadata: Metadata = { title: "Certificates — Gurukulam" };

/**
 * What a student has earned.
 *
 * ── Why the batches with nothing issued are on this page ────────────────
 *
 * Because "where is mine" is the question it is actually opened with. A page
 * that listed only issued certificates would answer a question the student does
 * not have, and leave the real one to be settled by assuming we forgot. Saying
 * how far the batch has got turns it into a fact with a date attached.
 *
 * ── Why a college student reaches this and is not refused ───────────────
 *
 * Invariant 7: they earned the certificate on identical terms and their
 * institution holds the download. That is an explanation, not a refusal, and
 * hiding the certificate would read as a bug to someone who knows they passed.
 * The record, the number and the verification code are all theirs; the file is
 * the college's to hand over. The API decides that with the same function the
 * admin download goes through.
 */
export default async function MyCertificatesPage() {
  /* Guarded here as well as in the layout — see the note on the home page. */
  await requireStudent();

  const { certificates, awaiting, collegeName } = await getCertificates();

  const held = certificates.some((certificate) => certificate.heldByCollege);

  return (
    <PortalPage
      eyebrow="Certificates"
      title="My certificates"
      description="What you have earned, and where the rest stand."
    >
      {/* Named once, at the top, rather than inside every card: the institution
          is the same institution for all of them, and repeating it turns an
          arrangement into a complaint. */}
      {held ? (
        <PortalCard>
          <p className="text-body text-ink">
            {collegeName === null ? "Your college" : collegeName} collects and issues certificates
            for its students, so the copies below are requested from your placement office. The
            verification code on each one is yours to give out.
          </p>
        </PortalCard>
      ) : null}

      {certificates.length === 0 ? (
        <PortalCard>
          <EmptyState
            title="Nothing issued yet"
            description="A certificate is issued once your batch has finished and the office has checked your record."
          />
        </PortalCard>
      ) : (
        <ul className="flex flex-col gap-4">
          {certificates.map((certificate) => (
            <li key={certificate.certificateId}>
              <CertificateCard certificate={certificate} />
            </li>
          ))}
        </ul>
      )}

      {awaiting.length === 0 ? null : (
        <section aria-labelledby="awaiting" className="flex min-w-0 flex-col gap-4">
          <h2 id="awaiting" className="text-h2 text-ink">
            Still to come
          </h2>
          <ul className="flex flex-col gap-4">
            {awaiting.map((batch) => (
              <li key={batch.batchId}>
                <AwaitingCard batch={batch} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </PortalPage>
  );
}

/**
 * A batch with no certificate against it yet.
 *
 * ── Why it counts sessions rather than saying "pending" ─────────────────
 *
 * "Pending" is a word that could mean tomorrow or never. Eleven of twenty-four
 * sessions delivered is the same fact with something a student can do with it,
 * and it is a number the product already knows. The completion criteria
 * themselves are an open question (`admin-portal-plan.md` §7), so this says what
 * has happened rather than predicting a date nobody has agreed.
 */
function AwaitingCard({ batch }: { batch: MeBatch }) {
  return (
    <PortalCard>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="min-w-0 text-body font-semibold break-words text-ink">
            {batch.courseName ?? batch.name}
          </h3>
          <span className="font-mono text-caption text-ink-subtle">{batch.batchCode}</span>
        </div>
        <p className="text-body-sm text-ink-muted">
          {batch.outcome === "COMPLETED"
            ? "You have finished this batch. The office issues the certificate once it has checked your record."
            : batch.outcome === "LEFT"
              ? "You are no longer on this batch, so no certificate is due. Speak to the office if that is wrong."
              : "Issued once the batch is complete and the office has checked your record."}{" "}
          <span className="tabular-nums">
            {batch.deliveredCount} of {batch.sessionCount}
          </span>{" "}
          {batch.sessionCount === 1 ? "session" : "sessions"} delivered.
        </p>
      </div>
    </PortalCard>
  );
}
