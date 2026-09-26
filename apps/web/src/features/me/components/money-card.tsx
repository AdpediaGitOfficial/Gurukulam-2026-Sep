import type { MeFees } from "@gurukulam/contracts";

import { PortalCard, PortalStat } from "@/features/me/components/portal-page";
import { portalDate } from "@/features/me/format";
import { isPositive, paidPercent, rupees } from "@/features/me/money";

/**
 * Where a student stands on money, in one card.
 *
 * ── Why there is no "Pay now" ───────────────────────────────────────────
 *
 * There is no payment gateway. Payments are collected offline and recorded by
 * the office, so the portal's job is to say what is due and by when. A button
 * that cannot take money is worse than no button: it is a promise the product
 * does not keep, and the person who presses it now has a question instead of
 * an answer. The caption says how payment actually happens, which is the thing
 * a button would have been standing in for.
 *
 * ── Why the next due date leads ─────────────────────────────────────────
 *
 * Of the three figures, only one is a decision: what to pay next, and when.
 * Paid-so-far and outstanding are context for it. So the due amount is first
 * and carries the colour, and it turns `danger` only when the date has
 * actually passed — a bill that shouts before it is late teaches people to
 * ignore it.
 */
export function MoneyCard({ fees }: { fees: MeFees }) {
  const percent = paidPercent(fees.totalPaidMinor, fees.totalPayableMinor);

  return (
    <PortalCard title="Money" action={{ href: "/portal/fees", label: "All installments" }}>
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-3">
        {fees.nextDue === null ? (
          <PortalStat
            label={isPositive(fees.totalOutstandingMinor) ? "Nothing scheduled" : "Fully paid"}
            value={isPositive(fees.totalOutstandingMinor) ? rupees(fees.totalOutstandingMinor) : "—"}
            intent={isPositive(fees.totalOutstandingMinor) ? "neutral" : "success"}
            {...(isPositive(fees.totalOutstandingMinor)
              ? { caption: "No instalment carries a date" }
              : {})}
          />
        ) : (
          <PortalStat
            label={fees.nextDue.overdue ? "Overdue" : `Due ${portalDate(fees.nextDue.dueDate)}`}
            value={rupees(fees.nextDue.outstandingMinor)}
            intent={fees.nextDue.overdue ? "danger" : "neutral"}
            caption={`Installment ${fees.nextDue.installmentNumber} of ${fees.nextDue.totalInstallments}`}
          />
        )}
        <PortalStat label="Paid so far" value={rupees(fees.totalPaidMinor)} />
        <PortalStat label="Outstanding" value={rupees(fees.totalOutstandingMinor)} />
      </div>

      <div
        className="mt-5 h-2 w-full overflow-hidden rounded-full bg-surface-muted"
        role="img"
        aria-label={`${rupees(fees.totalPaidMinor)} of ${rupees(fees.totalPayableMinor)} collected`}
      >
        <div className="h-full rounded-full bg-success" style={{ width: `${percent}%` }} />
      </div>

      <p className="mt-3 text-body-sm text-ink-muted">
        {rupees(fees.totalPaidMinor)} of {rupees(fees.totalPayableMinor)} collected. Payments are
        made offline and recorded by the office — this shows what is due, it does not take payment.
      </p>
    </PortalCard>
  );
}
