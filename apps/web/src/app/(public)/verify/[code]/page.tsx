import type { Metadata } from "next";
import type { Verification } from "@gurukulam/contracts";

import { Icon } from "@/components/ui/icon";
import { verifyCertificate } from "@/features/certificates/server/certificates-service";

export const metadata: Metadata = {
  title: "Certificate check — Gurukulam",
  /* No index: a verification result is about one named person, and a search
     engine holding a cached copy of it is a copy nobody consented to. */
  robots: { index: false, follow: false },
};

/**
 * The answer, for a stranger.
 *
 * ── Three answers, and they are not degrees of the same one ─────────────
 *
 * *Genuine* — the register holds it and it stands.
 * *Withdrawn* — the register holds it and it no longer stands. The reader is
 *   probably looking at a paper copy, and "never heard of it" would be a lie
 *   that helps nobody; they need to know it was real and was taken back.
 * *Not recognised* — a code we do not hold, or one belonging to a certificate
 *   that was never issued. Both look identical on purpose: confirming that a
 *   name and a course sit behind an unissued code would disclose somebody's
 *   record for something nobody awarded.
 *
 * Which of those a code gets is the API's decision. This page renders it.
 *
 * ── Why the verdict is a sentence before it is a colour ─────────────────
 *
 * The reader is deciding whether to trust a document, often on a phone, and may
 * be colour-blind or looking at a printout. So each state leads with words that
 * stand alone — "This certificate is genuine" — and the tint and icon agree with
 * them rather than carrying the meaning.
 */
export default async function VerificationPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const result = await verifyCertificate(decodeURIComponent(code));

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Verdict result={result} />

      {result.certificateNumber === null ? null : (
        <dl className="grid gap-4 rounded-card border border-hairline bg-surface p-5 sm:grid-cols-2 sm:p-6">
          <Field label="Awarded to" value={result.studentName ?? "—"} wide />
          <Field label="Course" value={result.courseName ?? "—"} wide />
          <Field label="Certificate number" value={result.certificateNumber} mono />
          <Field
            label="Issued"
            value={result.issuedDate === null ? "—" : longDate(result.issuedDate)}
          />
          {result.revokedAt === null ? null : (
            <Field label="Withdrawn" value={longDate(result.revokedAt)} />
          )}
        </dl>
      )}

      <p className="text-body-sm text-ink-muted">
        Checked against the Gurukulam register on{" "}
        {new Date().toLocaleDateString("en-IN", {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        })}
        . If something here does not match the document in front of you, contact us before relying
        on it.
      </p>
    </div>
  );
}

function Verdict({ result }: { result: Verification }) {
  if (result.valid) {
    return (
      <Banner
        intent="success"
        icon="check"
        title="This certificate is genuine"
        body="It is in our register and stands as issued."
      />
    );
  }

  if (result.status === "REVOKED") {
    return (
      <Banner
        intent="danger"
        icon="warn"
        title="This certificate has been withdrawn"
        body="It was issued and has since been withdrawn, so it should not be relied on. The record is below."
      />
    );
  }

  return (
    <Banner
      intent="neutral"
      icon="help"
      title="We do not recognise this code"
      body="No certificate in our register matches it. Check for a mistyped character — the code is
        case-sensitive — or ask the holder to send it again."
    />
  );
}

function Banner({
  intent,
  icon,
  title,
  body,
}: {
  intent: "success" | "danger" | "neutral";
  icon: "check" | "warn" | "help";
  title: string;
  body: string;
}) {
  const skin =
    intent === "success"
      ? "border-success/30 bg-success/5 text-success-strong"
      : intent === "danger"
        ? "border-danger/30 bg-danger/5 text-danger"
        : "border-hairline bg-surface-soft text-ink";

  return (
    <section className={`min-w-0 rounded-card border p-5 sm:p-6 ${skin}`}>
      <div className="flex min-w-0 items-start gap-3">
        <Icon name={icon} size={24} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <h1 className="text-h1 break-words">{title}</h1>
          <p className="mt-1 text-body break-words text-ink-muted">{body}</p>
        </div>
      </div>
    </section>
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
      <dd className={mono ? "mt-0.5 font-mono text-body break-all text-ink" : "mt-0.5 text-body break-words text-ink"}>
        {value}
      </dd>
    </div>
  );
}

/**
 * The month named in full.
 *
 * A verification is read once, by someone who has never seen this product, and
 * may be pasted into a record of the check. `12/10/2026` is two different days
 * depending on the reader's country; "12 October 2026" is one.
 */
function longDate(value: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00.000Z`)
    : new Date(value);
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
