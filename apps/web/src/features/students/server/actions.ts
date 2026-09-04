"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { allocateStudentSchema, allocationResultSchema } from "@gurukulam/contracts";

import { apiFetch, ApiRequestError, checkShape } from "@/server/api";
import { formError, type FormState } from "@/lib/form";

/**
 * Allocation — the step that turns a student record into an enrolment.
 *
 * One payload, applied by the API as one transaction: batch mapping, access to
 * every session in that batch (past and future), the fee ledger, its
 * installments and portal credentials. All of it lands or none of it does.
 *
 * The pricing fields are retail only. A college student is billed through
 * their institution's contract, so the form does not collect them and the API
 * refuses them outright rather than accepting and discarding them.
 */
export async function allocateStudent(
  studentId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const text = (key: string): string | undefined => {
    const value = formData.get(key);
    return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
  };

  // The schedule arrives as parallel arrays, one entry per row the operator
  // added. Zipping them here keeps the client component free of any knowledge
  // of the request shape.
  const amounts = formData.getAll("installmentAmount").map(String);
  const dueDates = formData.getAll("installmentDueDate").map(String);
  const installments = amounts
    .map((amount, index) => ({ amount: amount.trim(), dueDate: (dueDates[index] ?? "").trim() }))
    .filter((row) => row.amount !== "" || row.dueDate !== "");

  const advanceAmount = text("advanceAmount");

  const parsed = allocateStudentSchema.safeParse({
    batchId: formData.get("batchId"),
    enrolmentValue: text("enrolmentValue"),
    ...(advanceAmount === undefined
      ? {}
      : {
          advance: {
            amount: advanceAmount,
            mode: text("advanceMode") ?? "UPI",
            transactionId: text("advanceTransactionId"),
            paidAt: text("advancePaidAt") ?? "",
            bankOrHandle: text("advanceBankOrHandle"),
            notes: text("advanceNotes"),
          },
        }),
    installments,
    issueCredentials: formData.get("issueCredentials") === "on",
  });

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      // Nested paths become dotted keys, matching the input names the form uses.
      const key = issue.path.join(".");
      if (key !== "" && fields[key] === undefined) fields[key] = issue.message;
    }
    return formError("Check the details below.", fields);
  }

  try {
    checkShape(
      allocationResultSchema,
      await apiFetch(`/students/${studentId}/allocate`, { method: "POST", body: parsed.data }),
      "POST /students/:id/allocate",
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

  revalidatePath("/students");
  revalidatePath(`/students/${studentId}`);
  // Outside the try: `redirect` works by throwing, and caught above it would be
  // reported as a failed allocation that in fact succeeded.
  redirect(`/students/${studentId}?allocated=1`);
}
