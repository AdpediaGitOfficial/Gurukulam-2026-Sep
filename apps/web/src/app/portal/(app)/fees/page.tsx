import type { Metadata } from "next";
import type { MeInstallment, MeLedger } from "@gurukulam/contracts";

import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { StatusPill } from "@/components/ui/status-pill";
import { MoneyCard } from "@/features/me/components/money-card";
import { PortalCard, PortalPage } from "@/features/me/components/portal-page";
import { portalDate } from "@/features/me/format";
import { isPositive, rupees } from "@/features/me/money";
import { getFees } from "@/features/me/server/me-service";
import { requireStudent } from "@/server/principal";

export const metadata: Metadata = { title: "Fees — Gurukulam" };

const MODE: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  CARD: "Card",
  NETBANKING: "Net banking",
  CHEQUE: "Cheque",
  BANK_TRANSFER: "Bank transfer",
};

/**
 * What a student owes, and what they have paid.
 *
 * ── Why a college student reaches this and is not refused ───────────────
 *
 * Invariant 3 makes Fees ABSENT from their navigation, not empty — so they
 * never arrive here by tapping. But a URL can be typed or bookmarked, and a
 * 404 on a page that plainly exists for other people reads as a fault. The
 * honest answer is the one sentence their situation actually needs: the
 * institution is billed, and nothing here will ever be theirs to owe.
 *
 * ── Why every amount comes pre-computed ─────────────────────────────────
 *
 * Money is integer minor units at every layer (invariant 5). The API sums and
 * subtracts in `bigint`; this file formats. There is no arithmetic on this
 * page at all — not even a subtraction to find what is left on an instalment.
 */
export default async function MyFeesPage() {
  /* Guarded here as well as in the layout — see the note on the home page. */
  await requireStudent();

  const fees = await getFees();

  if (fees.billedToCollege) {
    return (
      <PortalPage
        eyebrow="Fees"
        title="Billed to your college"
        description="Nothing here is yours to pay."
      >
        <PortalCard>
          <div className="flex min-w-0 flex-col gap-3">
            <p className="text-body text-ink">
              {fees.collegeName === null
                ? "Your institution enrolled you"
                : `${fees.collegeName} enrolled you`}{" "}
              and is billed for your course under its own agreement with Gurukulam.
            </p>
            {/* Said out loud, because the alternative reading of an empty Fees
                page is "you owe nothing YET", and that is a different and
                more worrying sentence than the true one. */}
            <p className="text-body-sm text-ink-muted">
              You have no individual fee account, and no instalments will ever appear here. If you
              have a question about what your college was charged, ask them — we cannot show you
              their agreement.
            </p>
          </div>
        </PortalCard>
      </PortalPage>
    );
  }

  return (
    <PortalPage
      eyebrow="Fees"
      title="My fees"
      description="What you agreed to pay, what has been collected, and what is still due."
    >
      {fees.ledgers.length === 0 ? (
        <PortalCard>
          <EmptyState
            title="No fee account yet"
            description="One is created when the office allocates you to a batch, with the instalment schedule you agreed."
          />
        </PortalCard>
      ) : (
        <>
          <MoneyCard fees={fees} />

          {fees.overdueCount > 0 ? (
            <PortalCard className="border-danger/30 bg-danger/5">
              <p className="flex items-start gap-2 text-body text-danger">
                <Icon name="warn" size={20} className="mt-0.5 shrink-0" />
                <span>
                  {fees.overdueCount === 1
                    ? "One instalment is past its due date."
                    : `${fees.overdueCount} instalments are past their due date.`}{" "}
                  Contact the office to arrange payment.
                </span>
              </p>
            </PortalCard>
          ) : null}

          {fees.ledgers.map((ledger) => (
            <LedgerSection key={ledger.ledgerId} ledger={ledger} />
          ))}
        </>
      )}
    </PortalPage>
  );
}

function LedgerSection({ ledger }: { ledger: MeLedger }) {
  return (
    <section aria-labelledby={ledger.ledgerId} className="flex min-w-0 flex-col gap-4">
      <div>
        <h2 id={ledger.ledgerId} className="text-h2 text-ink">
          {ledger.courseName ?? "Your course"}
        </h2>
        <p className="text-body-sm text-ink-muted">
          {ledger.batchCode === null ? null : <span className="font-mono">{ledger.batchCode}</span>}
          {ledger.batchCode === null ? "" : " · "}
          {rupees(ledger.enrolmentValueMinor)} agreed · {rupees(ledger.paidMinor)} paid ·{" "}
          {rupees(ledger.outstandingMinor)} outstanding
        </p>
      </div>

      <ul className="flex flex-col gap-4">
        {ledger.installments.map((installment) => (
          <li key={installment.installmentId}>
            <InstallmentCard installment={installment} of={ledger.installments.length} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function InstallmentCard({ installment, of }: { installment: MeInstallment; of: number }) {
  const settled = !isPositive(installment.outstandingMinor);

  return (
    <PortalCard className={installment.overdue ? "border-danger/30" : undefined}>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="min-w-0">
            <span className="text-body font-semibold text-ink">
              Installment {installment.installmentNumber} of {of}
            </span>
            <span className="block text-caption text-ink-subtle">
              Due {portalDate(installment.dueDate)}
            </span>
          </p>
          {/* The stored status only moves when the nightly run touches it, so
              `overdue` is computed at read time and wins here — a student
              looking the morning after a missed date must not be told their
              instalment is still pending. */}
          {installment.overdue ? (
            <StatusPill intent="danger">overdue</StatusPill>
          ) : settled ? (
            <StatusPill intent="success">paid</StatusPill>
          ) : installment.status === "PARTIALLY_PAID" ? (
            <StatusPill intent="warning">part paid</StatusPill>
          ) : (
            <StatusPill intent="info">due</StatusPill>
          )}
        </div>

        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <span className="text-h2 tabular-nums text-ink">{rupees(installment.amountMinor)}</span>
          {settled ? null : (
            <span className="text-body-sm text-ink-muted">
              <span className="tabular-nums">{rupees(installment.outstandingMinor)}</span> still to
              pay
            </span>
          )}
        </div>

        {installment.payments.length === 0 ? (
          <p className="text-body-sm text-ink-subtle">Nothing received against this yet.</p>
        ) : (
          <ul className="flex flex-col gap-2 border-t border-hairline pt-3">
            {installment.payments.map((payment) => (
              <li
                key={payment.transactionId}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
              >
                <span className="min-w-0 text-body-sm text-ink-muted">
                  {/* A reversal is shown as its own line rather than quietly
                      removing the original: the receipt keeps its number, and
                      somebody told money was received is owed the record of it
                      being taken back off. */}
                  {payment.isReversal ? "Reversed" : "Received"} {portalDate(payment.paidAt)} ·{" "}
                  {MODE[payment.paymentMode] ?? payment.paymentMode}
                  {payment.receiptNumber === null ? null : (
                    <span className="font-mono text-caption text-ink-subtle">
                      {" "}
                      · {payment.receiptNumber}
                    </span>
                  )}
                </span>
                <span
                  className={
                    payment.isReversal
                      ? "text-body tabular-nums text-danger"
                      : "text-body tabular-nums text-success-strong"
                  }
                >
                  {payment.isReversal ? "−" : ""}
                  {rupees(payment.amountMinor)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PortalCard>
  );
}
