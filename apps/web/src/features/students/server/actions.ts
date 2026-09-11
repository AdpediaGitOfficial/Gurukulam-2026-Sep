"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  allocateStudentSchema,
  allocationResultSchema,
  createStudentSchema,
  studentSchema,
  suspendStudentSchema,
} from "@gurukulam/contracts";

/*
 * Everything the create schema asks for except the college, which cannot
 * change. Built here rather than reusing the contract's fully-partial update
 * because this form posts every field, so a blank required one is a mistake to
 * report rather than an omission to ignore.
 */
const editStudentSchema = createStudentSchema.omit({ collegeId: true });

import { apiFetch, ApiRequestError, checkShape } from "@/server/api";
import { apiFormError, clearable, fieldErrors, number, text } from "@/lib/action";
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

/**
 * Onboarding creates the RECORD ONLY.
 *
 * Course, batch, price, schedule and credentials are all decided at allocation,
 * which is why none of them are collected here. A student who exists but is not
 * in a batch is a real and expected state — it is what the unallocated queue
 * is for.
 *
 * `collegeId` is absent on the edit path, and the contract omits it too. It is
 * what makes intake institutional (invariant 1), and changing it would move a
 * student between segments — a retail student has an individual ledger a
 * college student may not have, and a roster they may not sit on. Correcting
 * it is a re-onboarding, not a field edit, so the form shows it locked.
 */
export async function saveStudent(
  studentId: string | undefined,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const editing = studentId !== undefined;
  const optional = editing
    ? (key: string) => clearable(formData, key)
    : (key: string) => text(formData, key);

  const body = {
    firstName: text(formData, "firstName"),
    lastName: optional("lastName"),
    email: text(formData, "email"),
    phone: optional("phone"),
    altPhone: optional("altPhone"),
    cityId: text(formData, "cityId"),
    addressLine1: optional("addressLine1"),
    addressLine2: optional("addressLine2"),
    postalCode: optional("postalCode"),
    discipline: optional("discipline"),
    passoutYear: number(formData, "passoutYear"),
    qualification: optional("qualification"),
    notes: optional("notes"),
  };

  const parsed = editing
    ? editStudentSchema.safeParse(body)
    : createStudentSchema.safeParse({
        ...body,
        // Setting a college is what makes this institutional intake; omitting
        // it is what makes it a retail walk-in. The two are the same field.
        collegeId: text(formData, "collegeId"),
      });

  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  try {
    checkShape(
      studentSchema,
      await apiFetch(editing ? `/students/${studentId}` : "/students", {
        method: editing ? "PATCH" : "POST",
        body: parsed.data,
      }),
      editing ? "PATCH /students/:id" : "POST /students",
    );
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath("/students");
  if (editing) revalidatePath(`/students/${studentId}`);
  redirect(editing ? `/students/${studentId}?saved=1` : "/students?created=1");
}

/**
 * Suspends a student's account.
 *
 * Access only: enrolment, billing and history are untouched, so a suspended
 * student keeps their roster place and their ledger keeps accruing. The reason
 * is required and stored — an account that stopped working with no explanation
 * is the thing whoever finds it has to go and ask about.
 */
export async function suspendStudent(
  studentId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = suspendStudentSchema.safeParse({ reason: text(formData, "reason") });
  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  try {
    checkShape(
      studentSchema,
      await apiFetch(`/students/${studentId}/suspend`, { method: "POST", body: parsed.data }),
      "POST /students/:id/suspend",
    );
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath(`/students/${studentId}`);
  redirect(`/students/${studentId}?suspended=1`);
}

/** Clears the suspension and the reason with it — it described a state that has ended. */
export async function reinstateStudent(
  studentId: string,
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  try {
    checkShape(
      studentSchema,
      await apiFetch(`/students/${studentId}/reinstate`, { method: "POST", body: {} }),
      "POST /students/:id/reinstate",
    );
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath(`/students/${studentId}`);
  redirect(`/students/${studentId}?reinstated=1`);
}
