"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  contractSchema,
  createContractSchema,
  paymentSchema,
  recordPaymentSchema,
  setScheduleSchema,
  updateContractSchema,
  type Contract,
} from "@gurukulam/contracts";

import { apiFetch, ApiRequestError, checkShape } from "@/server/api";
import { apiFormError, fieldErrors, number, text } from "@/lib/action";
import { formError, type FormState } from "@/lib/form";

/**
 * Records money received against one installment.
 *
 * A payment is an entry, never an edit: the installment's paid amount and the
 * ledger's balance are recalculated in the same transaction that writes the
 * receipt, so the two can never disagree. Overpayment is refused at save rather
 * than corrected afterwards.
 */
export async function recordPayment(
  ledgerId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = recordPaymentSchema.safeParse({
    installmentId: formData.get("installmentId"),
    amount: text(formData, "amount"),
    mode: text(formData, "mode") ?? "UPI",
    transactionId: text(formData, "transactionId"),
    paidAt: text(formData, "paidAt"),
    bankOrHandle: text(formData, "bankOrHandle"),
    receiptNumber: text(formData, "receiptNumber"),
    notes: text(formData, "notes"),
  });

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      if (key !== "" && fields[key] === undefined) fields[key] = issue.message;
    }
    return formError("Check the details below.", fields);
  }

  try {
    checkShape(
      paymentSchema,
      await apiFetch("/fee-ledger/payments", { method: "POST", body: parsed.data }),
      "POST /fee-ledger/payments",
    );
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return formError(
        error.message,
        Object.keys(error.fields).length > 0 ? error.fields : undefined,
      );
    }
    throw error;
  }

  revalidatePath(`/fee-ledger/${ledgerId}`);
  revalidatePath("/fee-ledger");
  // No redirect: the operator stays on the ledger, where the schedule and the
  // running balance have just changed and are the thing worth seeing.
  return { status: "idle", message: "Payment recorded." };
}

// ── Contracts ─────────────────────────────────────────────────────────────

/**
 * A college contract, on one of two commercial bases.
 *
 * Both are real and the schema carries both: PER_STUDENT bills a rate times a
 * headcount, FLAT_COHORT bills one price for the cohort however many turn up.
 * The form sends only the fields its chosen basis needs, and the contract
 * refuses the ones it does not — a per-student contract with no headcount
 * bills nothing, and that is a silent zero rather than an error.
 *
 * An override needs a reason, because an unexplained discount is the first
 * thing an audit asks about.
 */
export async function createContract(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const basis = text(formData, "commercialBasis") ?? "PER_STUDENT";
  const parsed = createContractSchema.safeParse({
    collegeId: text(formData, "collegeId"),
    courseId: text(formData, "courseId"),
    batchId: text(formData, "batchId"),
    commercialBasis: basis,
    ...(basis === "PER_STUDENT" ? { perStudentRate: text(formData, "perStudentRate") } : {}),
    ...(basis === "FLAT_COHORT" ? { flatCohortPrice: text(formData, "flatCohortPrice") } : {}),
    billableHeadcount: number(formData, "billableHeadcount") ?? 0,
    headcountBasis: text(formData, "headcountBasis") ?? "REQUIREMENT",
    overrideTotal: text(formData, "overrideTotal"),
    overrideReason: text(formData, "overrideReason"),
    notes: text(formData, "notes"),
  });
  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  let created: Contract;
  try {
    created = await apiFetch<Contract>("/fee-ledger/contracts", {
      method: "POST",
      body: parsed.data,
    });
    checkShape(contractSchema, created, "POST /fee-ledger/contracts");
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath("/fee-ledger/contracts");
  redirect(`/fee-ledger/contracts/${created.contractId}?created=1`);
}

/**
 * Correcting a contract's commercials.
 *
 * The COLLEGE and the COURSE are not editable, and the contract's update
 * schema omits them for the same reason a batch cannot change its course:
 * they decide who is billed and for what, and changing either makes the
 * instalments already raised belong to a different agreement.
 */
export async function updateContract(
  contractId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = updateContractSchema.safeParse({
    perStudentRate: text(formData, "perStudentRate"),
    flatCohortPrice: text(formData, "flatCohortPrice"),
    billableHeadcount: number(formData, "billableHeadcount"),
    headcountBasis: text(formData, "headcountBasis"),
    overrideTotal: text(formData, "overrideTotal") ?? null,
    overrideReason: text(formData, "overrideReason") ?? null,
    status: text(formData, "status"),
    signedAt: text(formData, "signedAt"),
    notes: text(formData, "notes"),
  });
  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  try {
    const saved = await apiFetch(`/fee-ledger/contracts/${contractId}`, {
      method: "PATCH",
      body: parsed.data,
    });
    checkShape(contractSchema, saved, "PATCH /fee-ledger/contracts/:id");
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath("/fee-ledger/contracts");
  revalidatePath(`/fee-ledger/contracts/${contractId}`);
  redirect(`/fee-ledger/contracts/${contractId}?saved=1`);
}

// ── Schedules ─────────────────────────────────────────────────────────────

/**
 * The hand-authored instalment schedule, for EITHER parent.
 *
 * Invariant 4: one instalment engine, two parents — `fee_installments` carries
 * a nullable `ledger_id` and a nullable `contract_id` with a CHECK that
 * exactly one is set. The wire shape is identical for both, which is why this
 * is one action taking a parent rather than two that would drift.
 *
 * It REPLACES the schedule wholesale. That is the API's contract, and it is
 * the right one: an instalment plan is a single negotiated thing, not a list
 * somebody appends to.
 */
export async function setSchedule(
  parent: "ledger" | "contract",
  parentId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const amounts = formData.getAll("amount").map((v) => v.toString().trim());
  const dueDates = formData.getAll("dueDate").map((v) => v.toString().trim());

  const installments = amounts
    .map((amount, index) => ({ amount, dueDate: dueDates[index] ?? "" }))
    // A row the operator added and left blank is not an instalment of zero.
    .filter((row) => row.amount !== "" || row.dueDate !== "");

  const parsed = setScheduleSchema.safeParse({ installments });
  if (!parsed.success) return formError("Check the schedule below.", fieldErrors(parsed.error.issues));

  const path =
    parent === "ledger"
      ? `/fee-ledger/${parentId}/schedule`
      : `/fee-ledger/contracts/${parentId}/schedule`;

  try {
    await apiFetch(path, { method: "PUT", body: parsed.data });
  } catch (error) {
    return apiFormError(error);
  }

  if (parent === "ledger") {
    revalidatePath(`/fee-ledger/${parentId}`);
    revalidatePath("/fee-ledger");
  } else {
    revalidatePath(`/fee-ledger/contracts/${parentId}`);
    revalidatePath("/fee-ledger/contracts");
  }
  return { status: "idle" };
}
