import "server-only";

import {
  contractSchema,
  ledgerDetailSchema,
  ledgerSummarySchema,
  ledgerRegisterSummarySchema,
  receiptSchema,
  type Contract,
  type LedgerDetail,
  type LedgerSummary,
  type LedgerRegisterSummary,
  type Page,
  type Receipt,
} from "@gurukulam/contracts";

import { apiFetch } from "@/server/api";

import { fetchPage, PAGE_KEYS, type SearchParams } from "@/server/list";

export const LEDGER_FILTERS = [
  ...PAGE_KEYS,
  "studentId",
  "courseId",
  "batchId",
  "status",
  "overdueOnly",
] as const;

/**
 * One row per student — the summary.
 *
 * Retail only, by construction: billing follows segment (invariant 3), so a
 * college student has no individual ledger at all. The institution is billed
 * under a contract instead, which is the `/fee-ledger/contracts` list.
 */
export async function listLedgers(params: SearchParams): Promise<Page<LedgerSummary>> {
  return fetchPage("/fee-ledger", ledgerSummarySchema, params, LEDGER_FILTERS);
}

export const CONTRACT_FILTERS = [...PAGE_KEYS, "collegeId", "courseId", "status"] as const;

/**
 * College billing. The institution is billed, not its students — one
 * installment engine, two parents, and exactly one of them is set per schedule.
 */
export async function listContracts(params: SearchParams): Promise<Page<Contract>> {
  return fetchPage("/fee-ledger/contracts", contractSchema, params, CONTRACT_FILTERS);
}

/** One student's ledger: the schedule, with the receipts posted against each row. */
export async function getLedger(ledgerId: string): Promise<LedgerDetail> {
  return ledgerDetailSchema.parse(await apiFetch(`/fee-ledger/${ledgerId}`));
}

/**
 * The receipt for one payment — the document the payer keeps.
 *
 * Derived at read time rather than stored, so a receipt that was reversed
 * afterwards says so on its face. Reversal is the only correction this module
 * has; there is no delete anywhere in it.
 */
export async function getReceipt(transactionId: string): Promise<Receipt> {
  return receiptSchema.parse(await apiFetch(`/fee-ledger/payments/${transactionId}/receipt`));
}

/** The register's headline figures, scoped exactly as the list is. */
export async function getLedgerSummary(): Promise<LedgerRegisterSummary> {
  return ledgerRegisterSummarySchema.parse(await apiFetch("/fee-ledger/summary"));
}
