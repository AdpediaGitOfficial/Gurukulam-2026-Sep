import type { NextRequest } from "next/server";
import { formatRupees, fromWire } from "@gurukulam/contracts";

import { listLedgers } from "@/features/ledger/server/ledger-service";
import { requireModule } from "@/server/principal";
import { collectAll, csvResponse, toCsv } from "@/server/csv";

/**
 * The register as a spreadsheet, for reconciliation against the bank.
 *
 * Money is written as plain digits with no symbol and no grouping: this file
 * is opened in a spreadsheet and summed, and "₹1,23,456.00" is text there.
 * Still integer-derived — the rupee string is built from paise, never a float.
 */
const rupees = (minor: string) => formatRupees(fromWire(minor), { symbol: false, paise: true })
  .replaceAll(",", "");

export async function GET(request: NextRequest): Promise<Response> {
  await requireModule("feeLedger");
  const params = Object.fromEntries(request.nextUrl.searchParams);
  // Pages through: an export that stops at the first page is a file
  // somebody reconciles against and finds most of the register missing from.
  const { rows } = await collectAll(listLedgers, params);

  return csvResponse(
    toCsv(
      [
        { header: "Student code", value: (r) => r.studentCode },
        { header: "Student", value: (r) => r.studentName },
        { header: "Course", value: (r) => r.courseName },
        { header: "Batch", value: (r) => r.batchCode },
        { header: "Course value", value: (r) => rupees(r.courseValueMinor) },
        { header: "Discount", value: (r) => (r.discountAmountMinor === null ? "0.00" : rupees(r.discountAmountMinor)) },
        { header: "Enrolment value", value: (r) => rupees(r.enrolmentValueMinor) },
        { header: "Paid", value: (r) => rupees(r.totalPaidMinor) },
        { header: "Balance", value: (r) => rupees(r.balancePendingMinor) },
        { header: "Installments paid", value: (r) => r.installmentsPaid },
        { header: "Installments total", value: (r) => r.installmentsTotal },
        { header: "Overdue", value: (r) => r.overdueCount },
        { header: "Next due", value: (r) => r.nextDueDate },
        { header: "Status", value: (r) => r.status },
      ],
      rows,
    ),
    "fee-ledger",
  );
}
