import type { Metadata } from "next";

import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatusPill } from "@/components/ui/status-pill";
import { CampusCard, CampusField, CampusPage, CampusStat } from "@/features/campus/components/campus-page";
import { campusDate } from "@/features/campus/format";
import { getBilling } from "@/features/campus/server/campus-service";
import { requireCollegeUser } from "@/server/principal";
import { paidPercent, rupees } from "@/lib/money";

export const metadata: Metadata = { title: "Billing — Gurukulam" };

const BASIS: Record<string, string> = {
  PER_STUDENT: "Per student",
  FLAT_COHORT: "One price for the cohort",
};

/**
 * What the institution owes.
 *
 * ── Why a college has a money screen and a college student does not ────
 *
 * Invariant 3: billing follows segment. Retail bills the student; college bills
 * the institution, and a college student has NO individual ledger at all — which
 * is why Fees is absent from their portal's navigation rather than showing zero.
 * This is the other side of that same rule: the money is genuinely the college's,
 * so it gets a screen of its own rather than a line on an overview.
 *
 * ── Why it is not the `feeLedger` module ───────────────────────────────
 *
 * That module is the per-student ledger. Reading it here would return nothing
 * and render as "you owe nothing", which is the most expensive empty state in
 * the product. The institution's money hangs off its CONTRACT, through the same
 * installment engine with its other parent set (invariant 4).
 *
 * ── Every figure was summed on the server ──────────────────────────────
 *
 * In `bigint`, and it arrives as a decimal string of paise. Nothing on this
 * screen adds, subtracts or compares money — including "is this overdue", which
 * is a comparison and is decided by the API.
 */
export default async function CampusBillingPage() {
  await requireCollegeUser();
  const billing = await getBilling();

  return (
    <CampusPage
      eyebrow="Billing"
      title="What you owe"
      description="Every contract with us, what has been paid, and what is due next."
    >
      <CampusCard>
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          <CampusStat label="Billed" value={rupees(billing.billedMinor)} />
          <CampusStat label="Paid" value={rupees(billing.paidMinor)} intent="success" />
          <CampusStat label="Outstanding" value={rupees(billing.outstandingMinor)} />
          <CampusStat
            label="Overdue"
            value={rupees(billing.overdueMinor)}
            intent={billing.overdueMinor === "0" ? "neutral" : "danger"}
            caption={billing.overdueMinor === "0" ? "Nothing late" : "Past its due date"}
          />
        </div>

        {billing.nextDue === null ? null : (
          <p className="mt-5 border-t border-hairline pt-4 text-body text-ink-muted">
            Next due:{" "}
            <span className="font-semibold text-ink">{rupees(billing.nextDue.amountMinor)}</span> on{" "}
            {campusDate(billing.nextDue.dueDate)} against{" "}
            <span className="font-mono text-caption">{billing.nextDue.contractCode}</span>.
          </p>
        )}
      </CampusCard>

      {/* Payments are collected offline and recorded by us — there is no gateway
          in this product. Saying so is what stops a bursar hunting for a Pay
          button that was never going to be there. */}
      <p className="text-body-sm text-ink-subtle">
        Payments are made by transfer or cheque as agreed, and we record each one against the
        instalment it settles. Your Gurukulam contact can send a receipt for any of them.
      </p>

      {billing.contracts.length === 0 ? (
        <CampusCard>
          <EmptyState
            title="No contracts yet"
            description="A contract is drawn up when a requirement is confirmed, and its instalments appear here."
          />
        </CampusCard>
      ) : (
        billing.contracts.map((contract) => (
          <CampusCard key={contract.contractId}>
            <div className="mb-4 flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div className="min-w-0">
                <h2 className="text-h3 break-words text-ink">{contract.courseName ?? "A course"}</h2>
                <p className="font-mono text-caption text-ink-subtle">
                  {contract.contractCode}
                  {contract.batchCode === null ? "" : ` · ${contract.batchCode}`}
                </p>
              </div>
              <StatusPill
                intent={
                  contract.status === "ACTIVE"
                    ? "info"
                    : contract.status === "COMPLETED"
                      ? "success"
                      : "neutral"
                }
              >
                {contract.status.replace(/_/g, " ").toLowerCase()}
              </StatusPill>
            </div>

            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <CampusField label="Basis" value={BASIS[contract.commercialBasis] ?? contract.commercialBasis} />
              {/* The rate and the headcount, for a per-student contract only:
                  on a flat cohort price they are not what the total is made of,
                  and showing a rate that nothing multiplies invites a bursar to
                  check arithmetic that was never done. */}
              {contract.commercialBasis === "PER_STUDENT" ? (
                <>
                  <CampusField
                    label="Rate"
                    value={
                      contract.perStudentRateMinor === null
                        ? null
                        : `${rupees(contract.perStudentRateMinor)} each`
                    }
                  />
                  <CampusField label="Headcount" value={contract.billableHeadcount} />
                </>
              ) : null}
              <CampusField
                label="Total"
                value={contract.totalValueMinor === null ? null : rupees(contract.totalValueMinor)}
              />
              <CampusField label="Paid" value={rupees(contract.paidMinor)} />
              <CampusField label="Balance" value={rupees(contract.balanceMinor)} />
            </dl>

            {contract.totalValueMinor === null ? null : (
              <div className="mt-5">
                <ProgressBar
                  value={paidPercent(contract.paidMinor, contract.totalValueMinor)}
                  label="Paid so far"
                />
              </div>
            )}

            {contract.installments.length === 0 ? (
              <p className="mt-5 border-t border-hairline pt-4 text-body-sm text-ink-subtle">
                No instalment schedule has been drawn up for this contract yet.
              </p>
            ) : (
              <ul className="mt-5 flex flex-col divide-y divide-hairline border-t border-hairline">
                {contract.installments.map((installment) => (
                  <li
                    key={installment.installmentId}
                    className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
                  >
                    <span className="min-w-0">
                      <span className="text-body font-semibold text-ink">
                        {rupees(installment.amountMinor)}
                      </span>
                      <span className="ml-2 text-body-sm text-ink-muted">
                        due {campusDate(installment.dueDate)}
                      </span>
                    </span>
                    {installment.status === "PAID" ? (
                      <StatusPill intent="success">
                        paid{installment.paidAt === null ? "" : ` ${campusDate(installment.paidAt)}`}
                      </StatusPill>
                    ) : installment.overdue ? (
                      <StatusPill intent="danger">
                        overdue
                        {installment.paidAmountMinor === "0"
                          ? ""
                          : ` · ${rupees(installment.paidAmountMinor)} paid`}
                      </StatusPill>
                    ) : (
                      <StatusPill intent="neutral">
                        {installment.paidAmountMinor === "0"
                          ? "not yet due"
                          : `${rupees(installment.paidAmountMinor)} paid`}
                      </StatusPill>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CampusCard>
        ))
      )}
    </CampusPage>
  );
}
