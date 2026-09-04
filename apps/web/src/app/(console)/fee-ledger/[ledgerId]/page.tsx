import type { Metadata } from "next";
import Link from "next/link";
import { formatRupees, fromWire, type InstallmentWithPayments } from "@gurukulam/contracts";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody, PageSection } from "@/components/patterns/page-section";
import { StatTile, StatTileGrid } from "@/components/patterns/stat-tile";
import { Card } from "@/components/ui/card";
import { Column, DataTable } from "@/components/ui/data-table";
import { StatusPill } from "@/components/ui/status-pill";
import { RecordPaymentForm } from "@/features/ledger/components/record-payment-form";
import { getLedger } from "@/features/ledger/server/ledger-service";
import { requireModule } from "@/server/principal";
import { brandTokens, feedbackTokens } from "@/design-system/tokens";
import { formatCount } from "@/lib/format";

export const metadata: Metadata = { title: "Student ledger" };

const money = (minor: string) => formatRupees(fromWire(minor), { paise: false });

const STATUS: Record<string, { intent: "success" | "warning" | "danger" | "neutral"; label: string }> = {
  PENDING: { intent: "neutral", label: "Pending" },
  PARTIALLY_PAID: { intent: "warning", label: "Part paid" },
  PAID: { intent: "success", label: "Paid" },
  OVERDUE: { intent: "danger", label: "Overdue" },
};

const MODE: Record<string, string> = {
  UPI: "UPI",
  CREDIT_CARD: "Credit card",
  DEBIT_CARD: "Debit card",
  CASH: "Cash",
  OTHER: "Other",
};

const COLUMNS: Column<InstallmentWithPayments>[] = [
  {
    id: "n",
    header: "#",
    cell: (row) => <span className="font-mono font-semibold">I{row.installmentNumber}</span>,
  },
  {
    id: "amount",
    header: "Amount",
    align: "end",
    cell: (row) => <span className="font-mono tabular-nums">{money(row.amountMinor)}</span>,
  },
  {
    id: "due",
    header: "Due",
    cell: (row) => (
      <span className="text-body-sm text-ink-muted">
        {new Date(row.dueDate).toLocaleDateString("en-IN")}
      </span>
    ),
  },
  {
    id: "paid",
    header: "Paid",
    align: "end",
    cell: (row) =>
      fromWire(row.paidAmountMinor) === 0n ? (
        <span className="text-ink-subtle">—</span>
      ) : (
        <span className="font-mono text-success-strong tabular-nums">
          {money(row.paidAmountMinor)}
        </span>
      ),
  },
  {
    id: "outstanding",
    header: "Outstanding",
    align: "end",
    cell: (row) => {
      const left = fromWire(row.outstandingMinor);
      return (
        <span
          className={`font-mono tabular-nums ${left === 0n ? "text-ink-subtle" : "text-warning-strong"}`}
        >
          {money(row.outstandingMinor)}
        </span>
      );
    },
  },
  {
    id: "receipts",
    header: "Receipts",
    // A payment is an entry, not an edit — so the row shows every one posted
    // against it, reversals included, rather than only the net.
    cell: (row) =>
      row.payments.length === 0 ? (
        <span className="text-ink-subtle">—</span>
      ) : (
        <ul className="flex flex-col gap-1">
          {row.payments.map((payment) => (
            <li key={payment.transactionId} className="flex flex-wrap items-baseline gap-2">
              <span
                className={`font-mono text-caption tabular-nums ${payment.isReversal ? "text-danger" : "text-ink"}`}
              >
                {payment.isReversal ? "−" : ""}
                {money(payment.amountMinor)}
              </span>
              <span className="text-caption text-ink-subtle">
                {MODE[payment.paymentMode] ?? payment.paymentMode} ·{" "}
                {new Date(payment.paidAt).toLocaleDateString("en-IN")}
              </span>
              {payment.externalTransactionId === null ? null : (
                <span className="font-mono text-caption text-ink-subtle">
                  {payment.externalTransactionId}
                </span>
              )}
            </li>
          ))}
        </ul>
      ),
  },
  {
    id: "status",
    header: "Status",
    cell: (row) => {
      const status = STATUS[row.status] ?? { intent: "neutral" as const, label: row.status };
      return <StatusPill intent={status.intent}>{status.label}</StatusPill>;
    },
  },
];

export default async function LedgerDetailPage({
  params,
}: {
  params: Promise<{ ledgerId: string }>;
}) {
  await requireModule("feeLedger");
  const { ledgerId } = await params;
  const ledger = await getLedger(ledgerId);

  const open = ledger.installments.filter((i) => fromWire(i.outstandingMinor) > 0n);

  return (
    <PageBody>
      <PageHeader
        eyebrow="Fee ledger"
        title={ledger.studentName}
        description={`${ledger.studentCode} · ${ledger.courseName ?? "—"}${ledger.batchCode === null ? "" : ` · ${ledger.batchCode}`}`}
        breadcrumbs={[
          { label: "Fee ledger", href: "/fee-ledger" },
          { label: ledger.studentName },
        ]}
        action={
          <Link
            href={`/students/${ledger.studentId}`}
            className="text-body-sm text-gold underline-offset-4 hover:underline"
          >
            Open student record
          </Link>
        }
      />

      <StatTileGrid>
        <StatTile
          label="Enrolment value"
          value={money(ledger.enrolmentValueMinor)}
          caption={
            ledger.discountAmountMinor === null || fromWire(ledger.discountAmountMinor) === 0n
              ? "No discount"
              : `${money(ledger.discountAmountMinor)} off ${money(ledger.courseValueMinor)}`
          }
          icon="rupee"
          color={brandTokens.gold}
        />
        <StatTile
          label="Collected"
          value={money(ledger.totalPaidMinor)}
          caption={`${formatCount(ledger.installmentsPaid)} of ${formatCount(ledger.installmentsTotal)} installments`}
          icon="check"
          color={feedbackTokens.success}
        />
        <StatTile
          label="Balance"
          value={money(ledger.balancePendingMinor)}
          caption={
            ledger.nextDueDate === null
              ? "Nothing scheduled"
              : `next due ${new Date(ledger.nextDueDate).toLocaleDateString("en-IN")}`
          }
          icon="warn"
          color={
            fromWire(ledger.balancePendingMinor) === 0n
              ? brandTokens.inkMuted
              : feedbackTokens.warning
          }
        />
        <StatTile
          label="Overdue"
          value={formatCount(ledger.overdueCount)}
          caption={ledger.overdueCount === 0 ? "Nothing past due" : "Installments past their date"}
          icon="clock"
          color={ledger.overdueCount === 0 ? brandTokens.inkMuted : feedbackTokens.danger}
        />
      </StatTileGrid>

      <div className="grid gap-8 xl:grid-cols-3">
        <PageSection
          title="Installment schedule"
          description="Hand-authored at allocation. Every receipt posted against a row is listed with it."
          className="xl:col-span-2"
        >
          <Card padding="none" className="overflow-hidden">
            <DataTable
              columns={COLUMNS}
              rows={ledger.installments}
              getRowId={(row) => row.installmentId}
              caption="Installments with their due dates, payments and status"
              minWidth="900px"
            />
          </Card>
        </PageSection>

        <div className="flex flex-col gap-6">
          <RecordPaymentForm ledgerId={ledger.ledgerId} installments={open} />
        </div>
      </div>
    </PageBody>
  );
}
