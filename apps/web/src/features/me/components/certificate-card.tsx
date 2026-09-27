import type { MeCertificate } from "@gurukulam/contracts";

import { Icon } from "@/components/ui/icon";
import { StatusPill } from "@/components/ui/status-pill";
import { PortalCard } from "@/features/me/components/portal-page";
import { portalDate } from "@/features/me/format";
import { verifyPath } from "@/lib/safe-path";

/**
 * One certificate, as the person who earned it reads it.
 *
 * ── The code leads, not the download ────────────────────────────────────
 *
 * A PDF proves nothing: anyone can edit one. What an employer can act on is the
 * verification code, checked against the public verifier, which reads the row
 * live and so reflects a revocation the moment it happens. So the code is given
 * the room, with the sentence that says what to do with it — and the download,
 * where there is one, is the secondary act.
 *
 * ── Three endings, not two ──────────────────────────────────────────────
 *
 * A link to fetch · "your college holds it" · "there is no file yet". The last
 * two are different sentences and must not be collapsed: a student told their
 * college holds something the office was never sent is a student sent to argue
 * with a stranger. Invariant 7 decides the middle one, in the API, using the
 * same function the admin download goes through.
 *
 * ── Why a revoked certificate is still here ─────────────────────────────
 *
 * Because it will fail verification, and the student is the one who will be
 * standing there when it does. It keeps its number and loses the sentence about
 * handing the code to anybody — a withdrawn certificate must not be offered as
 * something to show.
 */
export function CertificateCard({ certificate }: { certificate: MeCertificate }) {
  const revoked = certificate.status === "REVOKED";

  return (
    <PortalCard className={revoked ? "border-danger/30" : undefined}>
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="min-w-0 text-body font-semibold break-words text-ink">
            {certificate.courseName ?? "Your course"}
          </h3>
          {revoked ? (
            <StatusPill intent="danger">withdrawn</StatusPill>
          ) : (
            <StatusPill intent="success">issued</StatusPill>
          )}
        </div>

        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label="Certificate number" value={certificate.certificateNumber} mono />
          <Field
            label={revoked ? "Withdrawn" : "Issued"}
            value={
              revoked
                ? certificate.revokedAt === null
                  ? "—"
                  : portalDate(certificate.revokedAt)
                : certificate.issuedDate === null
                  ? "—"
                  : portalDate(certificate.issuedDate)
            }
          />
          {revoked ? null : (
            <Field label="Verification code" value={certificate.verificationCode} mono wide />
          )}
          <Field label="Batch" value={certificate.batchCode} mono />
        </dl>

        {revoked ? (
          <p className="rounded-well bg-danger/5 p-3 text-body-sm text-danger">
            This certificate has been withdrawn and will not pass verification. Contact the office —
            they can tell you why and what happens next.
          </p>
        ) : (
          <p className="text-body-sm text-ink-muted">
            Anyone can check this certificate is genuine with the code above — hand them the code
            rather than a copy of the file.{" "}
            <a
              href={verifyPath(certificate.verificationCode)}
              className="font-medium text-brand underline-offset-4 hover:underline"
            >
              See what they will see
            </a>
            .
          </p>
        )}

        {/* ── The three endings ────────────────────────────────────────── */}
        {revoked ? null : certificate.heldByCollege ? (
          <HeldByCollege />
        ) : certificate.downloadUrl !== null ? (
          <a
            href={certificate.downloadUrl}
            className="flex w-fit items-center gap-2 text-body-sm font-medium text-brand underline-offset-4 hover:underline"
          >
            <Icon name="down" size={18} />
            Download the certificate
          </a>
        ) : (
          /* Not a disabled button. The file genuinely is not there yet, and a
             control that cannot do its job is worse than a sentence that says
             so — the student presses it and now has a question instead of an
             answer. */
          <p className="text-body-sm text-ink-subtle">
            The printed copy is not online yet. The office can send it to you, and the code above is
            what proves the certificate in the meantime.
          </p>
        )}
      </div>
    </PortalCard>
  );
}

/**
 * Invariant 7, as the sentence it actually is.
 *
 * Not "you are not allowed". They earned it on identical terms, and saying so
 * first is the difference between an explanation and a refusal — the screen has
 * to read as the arrangement working rather than as something going wrong,
 * because a student who knows they passed will otherwise read it as a bug.
 *
 * It does NOT restate the arrangement or name the institution. The page says
 * that once, above, because it is the same college for every certificate on the
 * screen — repeating it per card turns one explanation into a series of
 * refusals, which is precisely the reading this is written to avoid.
 */
function HeldByCollege() {
  return (
    <p className="rounded-well bg-surface-soft p-3 text-body-sm text-ink">
      You earned this on the same terms as anyone else — the copy comes from your placement office.
    </p>
  );
}

function Field({
  label,
  value,
  mono = false,
  wide = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "min-w-0 sm:col-span-2" : "min-w-0"}>
      <dt className="text-overline text-ink-subtle uppercase">{label}</dt>
      <dd
        className={
          mono
            ? "mt-0.5 font-mono text-body break-all text-ink"
            : "mt-0.5 text-body break-words text-ink"
        }
      >
        {value}
      </dd>
    </div>
  );
}
