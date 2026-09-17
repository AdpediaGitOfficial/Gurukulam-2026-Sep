import type { Metadata } from "next";
import Link from "next/link";
import { can, formatRupees, fromWire, type Receipt } from "@gurukulam/contracts";

import { ConfirmWithReason } from "@/components/patterns/confirm-with-reason";
import { PrintButton } from "@/features/ledger/components/print-button";
import { reversePayment } from "@/features/ledger/server/actions";
import { getReceipt } from "@/features/ledger/server/ledger-service";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "Receipt" };

const money = (minor: string) => formatRupees(fromWire(minor));

const MODE: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  CARD: "Card",
  NETBANKING: "Net banking",
  CHEQUE: "Cheque",
  BANK_TRANSFER: "Bank transfer",
};

const day = (value: string) =>
  new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

/**
 * The receipt, as a document.
 *
 * Printing is the browser's job, which is why this is a page and not a PDF
 * generator: a print stylesheet costs nothing to maintain, renders the same
 * fonts the console already loads, and gives the operator "Save as PDF" in the
 * dialogue they already know. A server-side PDF library would be a dependency
 * and a font problem in exchange for the same file.
 *
 * Three things on it are not decoration:
 *
 *   · **The amount appears twice**, in figures and in words. Figures take a
 *     pen after issue; words do not.
 *   · **A reversed receipt says so across its face.** The document is derived
 *     at read time precisely so that it can — a receipt snapshotted at payment
 *     would go on claiming money was received.
 *   · **The payer follows the segment.** A college receipt is addressed to the
 *     institution, because a college student has no ledger to be billed
 *     against (invariant 3).
 */
export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ transactionId: string }>;
}) {
  const principal = await requireModule("feeLedger", "read");
  const { transactionId } = await params;
  const receipt = await getReceipt(transactionId);

  const reversed = receipt.reversedAt !== null;
  const isReversal = receipt.kind === "REVERSAL";
  /* The API refuses a reversal of a reversal and refuses one already reversed,
     and both refusals are visible on the document itself — the stamp across
     its face — so the verb is absent rather than offered and turned down. */
  const mayReverse = can(principal, "feeLedger", "edit") && !reversed && !isReversal;
  const backHref = receipt.payer.type === "STUDENT" ? "/fee-ledger" : "/fee-ledger/contracts";

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 print:max-w-none print:gap-0 print:p-0">
      {/* Everything here is the console, not the document. */}
      <div className="flex flex-col gap-4 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link href={backHref} className="text-body-sm text-ink-muted underline-offset-4 hover:underline">
            ← Back to the fee ledger
          </Link>
          <PrintButton />
        </div>
        {/* Reversing lives on the receipt rather than in the ledger's payment
            list, because this is the one screen that shows the whole payment —
            who paid, against which instalment, and where the account stands —
            and a reversal is the wrong thing to do from a one-line summary. */}
        {mayReverse ? (
          <div className="flex justify-end border-t border-hairline pt-3">
            <ConfirmWithReason
              id={`reverse-${receipt.transactionId}`}
              subject={`receipt ${receipt.receiptNumber}`}
              action={reversePayment.bind(null, receipt.transactionId)}
              trigger="Reverse this receipt"
              confirm="Reverse it"
              pending="Reversing…"
              required
              reasonLabel="Why it is being reversed"
              reasonPlaceholder="Cheque bounced — bank returned it on the 9th"
              reasonHint="Printed on both documents, so neither can be produced without the explanation."
              description="Writes a matching credit note and takes the money back off the instalment. This receipt is not deleted and keeps its number — it will read REVERSED from here on, which is what makes the collection register still reconcile."
            />
          </div>
        ) : null}
      </div>

      <article className="relative overflow-hidden rounded-card border border-hairline bg-surface p-8 print:rounded-none print:border-0 print:p-0 sm:p-10">
        {reversed || isReversal ? (
          <p
            aria-hidden
            className="pointer-events-none absolute right-[-1rem] top-10 rotate-[-18deg] select-none text-[3rem] font-bold uppercase tracking-widest text-danger/15 sm:text-[4.5rem]"
          >
            {isReversal ? "Credit note" : "Reversed"}
          </p>
        ) : null}

        {/* The document's own name, for anything reading its structure rather
            than its layout: a screen reader, a print stylesheet, the tab. The
            issuer's name is the masthead, which is a different thing. */}
        <h1 className="sr-only">
          {isReversal ? "Credit note" : "Payment receipt"} {receipt.receiptNumber} —{" "}
          {receipt.issuer.name}
        </h1>

        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-hairline pb-6">
          <div>
            <p className="text-h2 text-ink">{receipt.issuer.name}</p>
            {receipt.issuer.address === null ? null : (
              <p className="mt-1 max-w-xs text-body-sm text-ink-muted">{receipt.issuer.address}</p>
            )}
            {receipt.issuer.email === null && receipt.issuer.phone === null ? null : (
              <p className="mt-1 text-body-sm text-ink-muted">
                {[receipt.issuer.email, receipt.issuer.phone].filter(Boolean).join(" · ")}
              </p>
            )}
            {receipt.issuer.gstin === null ? null : (
              <p className="mt-1 font-mono text-caption text-ink-muted">GSTIN {receipt.issuer.gstin}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-caption uppercase tracking-wide text-ink-muted">
              {isReversal ? "Credit note" : "Payment receipt"}
            </p>
            <p className="mt-1 font-mono text-h3 text-ink">{receipt.receiptNumber}</p>
            <p className="mt-1 text-body-sm text-ink-muted">{day(receipt.paidAt)}</p>
          </div>
        </header>

        {reversed ? (
          <div className="mt-6 rounded-well border border-danger/30 bg-danger/5 p-4 text-body-sm text-danger">
            <p>
              <strong>This receipt was reversed on {day(receipt.reversedAt ?? receipt.paidAt)}</strong>
              {receipt.reversedByReceiptNumber === null ? null : <> by {receipt.reversedByReceiptNumber}</>}.
              The money it records is no longer credited to this account.
            </p>
            {/* The reason is somebody's own words and may end however they
                left it, so it gets its own line rather than running into the
                sentence above. */}
            {receipt.reversalReason === null ? null : (
              <p className="mt-2 italic">&ldquo;{receipt.reversalReason}&rdquo;</p>
            )}
          </div>
        ) : null}

        {isReversal ? (
          <div className="mt-6 rounded-well border border-danger/30 bg-danger/5 p-4 text-body-sm text-danger">
            <p>
              <strong>This is a reversing entry</strong>
              {receipt.reversesReceiptNumber === null ? null : <>, correcting {receipt.reversesReceiptNumber}</>}.
              It is not a receipt for money received.
            </p>
            {receipt.reversalReason === null ? null : (
              <p className="mt-2 italic">&ldquo;{receipt.reversalReason}&rdquo;</p>
            )}
          </div>
        ) : null}

        <section className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <h2 className="text-caption uppercase tracking-wide text-ink-muted">
              {isReversal
                ? "Credited back to"
                : receipt.payer.type === "COLLEGE"
                  ? "Billed to the institution"
                  : "Received from"}
            </h2>
            <p className="mt-2 text-h3 text-ink">{receipt.payer.name}</p>
            <p className="font-mono text-caption text-ink-muted">{receipt.payer.code}</p>
            {receipt.payer.address === null ? null : (
              <p className="mt-1 text-body-sm text-ink-muted">{receipt.payer.address}</p>
            )}
            {receipt.payer.email === "" && receipt.payer.phone === null ? null : (
              <p className="mt-1 text-body-sm text-ink-muted">
                {[receipt.payer.email, receipt.payer.phone].filter(Boolean).join(" · ")}
              </p>
            )}
            {receipt.payer.type === "COLLEGE" ? (
              <p className="mt-2 max-w-xs text-caption text-ink-subtle">
                A college engagement bills the institution, never its students.
              </p>
            ) : null}
          </div>

          <div>
            <h2 className="text-caption uppercase tracking-wide text-ink-muted">Towards</h2>
            <p className="mt-2 text-h3 text-ink">{receipt.courseName ?? "—"}</p>
            {receipt.batchCode === null ? null : (
              <p className="font-mono text-caption text-ink-muted">{receipt.batchCode}</p>
            )}
            <p className="mt-1 text-body-sm text-ink-muted">
              Installment {receipt.installmentNumber} of {receipt.installmentOfTotal} ·{" "}
              {money(receipt.installmentAmountMinor)} due {day(receipt.installmentDueDate)}
            </p>
          </div>
        </section>

        <section className="mt-8 rounded-well bg-surface-sunken p-6 print:border print:border-hairline print:bg-surface">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <span className="text-body text-ink-muted">
              {isReversal ? "Amount reversed" : "Amount received"}
            </span>
            <span className="text-h1 tabular-nums text-ink">{money(receipt.amountMinor)}</span>
          </div>
          {/* Twice, on purpose: figures take a pen after issue and words do not. */}
          <p className="mt-2 border-t border-hairline pt-3 text-body-sm text-ink">
            {receipt.amountInWords}
          </p>
        </section>

        <section className="mt-6 grid gap-x-8 gap-y-3 text-body-sm sm:grid-cols-2">
          <Line label="Paid by" value={MODE[receipt.paymentMode] ?? receipt.paymentMode} />
          <Line label="Received on" value={day(receipt.paidAt)} />
          {receipt.externalTransactionId === null ? null : (
            <Line label="Transaction reference" value={receipt.externalTransactionId} mono />
          )}
          {receipt.bankOrHandle === null ? null : (
            <Line label="Bank / handle" value={receipt.bankOrHandle} />
          )}
          {/* The operator's own reference, from a bank statement or a receipt
              book. Distinct from the receipt number above, which this system
              generates and nobody types. */}
          {receipt.externalReference === null ? null : (
            <Line label="Their reference" value={receipt.externalReference} mono />
          )}
          {receipt.recordedByName === null ? null : (
            <Line label="Recorded by" value={receipt.recordedByName} />
          )}
        </section>

        {receipt.notes === null ? null : (
          <p className="mt-6 border-t border-hairline pt-4 text-body-sm text-ink-muted">{receipt.notes}</p>
        )}

        <section className="mt-8 border-t border-hairline pt-6">
          <h2 className="text-caption uppercase tracking-wide text-ink-muted">
            Where the account stands
          </h2>
          <dl className="mt-3 grid gap-x-8 gap-y-2 text-body-sm sm:grid-cols-3">
            <Figure label="This installment" value={money(receipt.installmentOutstandingMinor)} caption="still due" />
            <Figure label="Collected to date" value={money(receipt.accountPaidMinor)} caption={`of ${money(receipt.accountTotalMinor)}`} />
            <Figure label="Balance" value={money(receipt.accountOutstandingMinor)} caption="outstanding" />
          </dl>
          <p className="mt-3 text-caption text-ink-subtle">
            Read at {day(receipt.issuedAt)} and current as of printing — these figures are the
            account today, not the account on the day this payment was taken.
          </p>
        </section>

        <footer className="mt-8 border-t border-hairline pt-4 text-caption text-ink-subtle">
          Computer-generated. {receipt.receiptNumber} is issued once and never reused; a correction
          is a separate reversing entry, not an edit to this one.
        </footer>
      </article>
    </main>
  );
}

function Line({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hairline/60 pb-2">
      <span className="text-ink-muted">{label}</span>
      <span className={mono ? "font-mono text-caption text-ink" : "text-ink"}>{value}</span>
    </div>
  );
}

function Figure({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <div>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-h3 tabular-nums text-ink">{value}</dd>
      <dd className="text-caption text-ink-subtle">{caption}</dd>
    </div>
  );
}
