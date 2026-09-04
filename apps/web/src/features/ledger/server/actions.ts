"use server";

import { revalidatePath } from "next/cache";
import { paymentSchema, recordPaymentSchema } from "@gurukulam/contracts";

import { apiFetch, ApiRequestError } from "@/server/api";
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
  const text = (key: string): string | undefined => {
    const value = formData.get(key);
    return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
  };

  const parsed = recordPaymentSchema.safeParse({
    installmentId: formData.get("installmentId"),
    amount: text("amount"),
    mode: text("mode") ?? "UPI",
    transactionId: text("transactionId"),
    paidAt: text("paidAt"),
    bankOrHandle: text("bankOrHandle"),
    receiptNumber: text("receiptNumber"),
    notes: text("notes"),
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
    paymentSchema.parse(
      await apiFetch("/fee-ledger/payments", { method: "POST", body: parsed.data }),
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
