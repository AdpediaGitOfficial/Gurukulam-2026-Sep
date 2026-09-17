"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  allocateStudentSchema,
  allocationResultSchema,
  createStudentSchema,
  parseStudentImport,
  studentImportResultSchema,
  studentSchema,
  suspendStudentSchema,
  type StudentImportResult,
  rosterOutcomeSchema,
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
/**
 * How a student's time on one batch ended.
 *
 * Deliberately NOT the delete verb beside it. Deallocation says the student
 * should not have been on this roster and soft-deletes the mapping; this
 * records that a real enrolment finished, or that the student left — and the
 * row stays live, because both are facts about somebody who genuinely attended
 * and both belong in the completion and drop-out rates the dashboard reports.
 *
 * Those two rates read "—" until this verb is used. The columns behind them
 * have been in the schema since the beginning and empty on every row, because
 * until now nothing could write them.
 */
export async function setRosterOutcome(
  studentId: string,
  batchId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = rosterOutcomeSchema.safeParse({
    batchId,
    outcome: text(formData, "outcome"),
    reason: text(formData, "reason"),
  });
  if (!parsed.success) return formError("Check the details below.", fieldErrors(parsed.error.issues));

  try {
    await apiFetch(`/students/${studentId}/roster-outcome`, {
      method: "POST",
      body: parsed.data,
    });
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath(`/students/${studentId}`);
  // The dashboard's completion and drop-out rates read these rows, so the
  // figure an operator just changed is stale until this runs.
  revalidatePath("/dashboard");
  redirect(`/students/${studentId}?outcome=1`);
}

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

/**
 * The state a bulk import round trip carries.
 *
 * `result` is the PLAN before it is committed and the outcome afterwards — one
 * shape, because they answer the same question and the screen should not have
 * two ways of showing it. `csv` survives the round trip so the commit sends the
 * very text that was planned.
 */
export interface ImportState {
  status: "idle" | "error";
  message?: string;
  result?: StudentImportResult;
  csv?: string;
}

/**
 * A file of students, loaded into the register.
 *
 * Parsed HERE, in the console, against the same schema the API validates
 * against — so a malformed spreadsheet is answered immediately with a row
 * number instead of a 400, and the API still refuses anything that slips past.
 *
 * `collegeId` pins every row to one institution, which is how the college
 * detail screen imports: the operator is looking at one college, and a stray
 * college_code in row 30 of a handed-over sheet must not enrol somebody
 * elsewhere.
 */
export async function importStudents(
  collegeId: string | null,
  _previous: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const commit = formData.get("intent") === "commit";

  const file = formData.get("file");
  const pasted = text(formData, "csv") ?? "";
  const fromFile = file instanceof File && file.size > 0 ? await file.text() : "";
  /* On a commit the pasted text IS the planned text — the hidden field carries
     it back — so the file input is ignored rather than re-read, which is what
     stops a swapped file committing a plan nobody looked at. */
  const source = commit ? pasted : fromFile || pasted;

  if (source.trim() === "") {
    return { status: "error", message: "Paste the rows, or choose a file." };
  }

  const parsed = parseStudentImport(source);
  if (!parsed.ok) return { status: "error", message: parsed.error, csv: source };

  try {
    const result = await apiFetch<StudentImportResult>("/students/import", {
      method: "POST",
      body: {
        dryRun: !commit,
        rows: parsed.rows,
        // The header goes with the rows: it is what tells the API a column the
        // file never carried is silence rather than an instruction to clear.
        columns: parsed.columns,
        ...(collegeId ? { collegeId } : {}),
      },
    });
    checkShape(studentImportResultSchema, result, "POST /students/import");

    if (result.committed) {
      revalidatePath("/students");
      revalidatePath("/students/unallocated");
      if (collegeId) revalidatePath(`/colleges/${collegeId}`);
    }
    return { status: result.rejected > 0 ? "error" : "idle", result, csv: source };
  } catch (error) {
    const state = apiFormError(error);
    return { status: "error", message: state.message ?? "That file could not be read.", csv: source };
  }
}

/**
 * Taking a student off a batch's roster.
 *
 * NOT the same as recording that they left it. `setRosterOutcome` says a real
 * enrolment ended and keeps the row, because it belongs in the completion and
 * drop-out rates. This soft-deletes the mapping: the student should not have
 * been on this roster at all — allocated to the wrong cohort, usually.
 *
 * The reason is required and stored, because six months later "why is this
 * student not on the batch their ledger was raised against" is a real
 * question and the mapping is the only thing that can answer it.
 */
export async function deallocateStudent(
  studentId: string,
  batchId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const reason = text(formData, "reason") ?? "";
  if (reason.trim() === "") {
    return formError("Check the details below.", { reason: "Say why they are leaving the roster" });
  }

  try {
    await apiFetch(`/students/${studentId}/deallocate`, {
      method: "POST",
      body: { batchId, reason },
    });
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/students");
  revalidatePath("/students/unallocated");
  redirect(`/students/${studentId}?deallocated=1`);
}
