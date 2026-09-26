"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { markAttendanceSchema, type AttendanceStatus } from "@gurukulam/contracts";

import { apiFetch } from "@/server/api";
import { apiFormError } from "@/lib/action";
import { formError, type FormState } from "@/lib/form";

/**
 * Taking the register.
 *
 * ── Why the whole session posts at once ────────────────────────────────
 *
 * A register is one act. Posting per student would leave a half-taken register
 * that is indistinguishable from one where everybody else was absent — and
 * that distinction decides whether a certificate can be issued, because
 * `eligibility.service.ts` reports NOT_EVALUATED rather than 0% when a batch
 * has no rows at all.
 *
 * So the form carries every student on the roster and this reads them all back
 * out of it. A student the form did not name is a student the register does
 * not cover, which the API refuses rather than guessing at.
 */
export async function markAttendance(
  sessionId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const entries: { studentId: string; status: AttendanceStatus; remarks?: string }[] = [];

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("status:")) continue;
    const studentId = key.slice("status:".length);
    const remarks = formData.get(`remarks:${studentId}`);
    entries.push({
      studentId,
      status: String(value) as AttendanceStatus,
      ...(typeof remarks === "string" && remarks.trim() !== "" ? { remarks: remarks.trim() } : {}),
    });
  }

  const parsed = markAttendanceSchema.safeParse({ entries });
  if (!parsed.success) {
    return formError("That register could not be read. Reload the page and try again.");
  }

  try {
    await apiFetch(`/batches/sessions/${encodeURIComponent(sessionId)}/attendance`, {
      method: "POST",
      body: parsed.data,
    });
  } catch (error) {
    // A cancelled session, a class that has not happened, a student who is not
    // on the roster, or a trainer who is no longer on the batch all land here.
    // The API's own sentence is shown, because each is a different fact.
    return apiFormError(error);
  }

  revalidatePath(`/teach/sessions/${sessionId}`);
  revalidatePath("/teach");
  return { status: "idle", message: "Register saved." };
}

/**
 * Marking one submission.
 *
 * Feedback without a number is allowed — "look at broadcasting again" on work
 * that was never scored out of anything is a real thing to want — so an empty
 * mark posts as null rather than as zero. A zero would tell a student their
 * work was marked and found worthless.
 */
export async function gradeSubmission(
  submissionId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const raw = formData.get("marksAwarded");
  const marks = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : null;
  if (marks !== null && !Number.isInteger(marks)) {
    return formError("Check the mark.", { marksAwarded: "Enter a whole number, or leave it empty" });
  }

  const feedback = formData.get("feedback");

  try {
    await apiFetch(`/batches/submissions/${encodeURIComponent(submissionId)}/grade`, {
      method: "POST",
      body: {
        marksAwarded: marks,
        ...(typeof feedback === "string" && feedback.trim() !== ""
          ? { feedback: feedback.trim() }
          : {}),
      },
    });
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath("/teach");
  return { status: "idle", message: "Marked." };
}

/**
 * Answering an invitation.
 *
 * ── Why the decision is a submit-button value ──────────────────────────
 *
 * Accept and decline are two verbs on one record, and a form that posted a
 * hidden field would need JavaScript to change it. `name` and `value` on the
 * button carry it with none, which matters on the screen a trainer opens on a
 * phone between classes.
 *
 * The API asserts the proposal is the caller's own — that path was written for
 * an admin recording somebody's answer, and nothing asked who was confirming
 * because nothing but an admin ever called it.
 */
export async function respondToInvitation(
  batchId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const decision = formData.get("decision");
  if (decision !== "CONFIRM" && decision !== "DECLINE") {
    return formError("Say whether you are accepting or turning it down.");
  }

  const reason = formData.get("reason");
  if (decision === "DECLINE" && (typeof reason !== "string" || reason.trim() === "")) {
    return formError("Say why, so the office knows what to do next.", {
      reason: "A reason is needed to turn a batch down",
    });
  }

  try {
    await apiFetch(`/batches/${encodeURIComponent(batchId)}/trainer/respond`, {
      method: "POST",
      body: {
        decision,
        ...(decision === "DECLINE" && typeof reason === "string" ? { reason: reason.trim() } : {}),
      },
    });
  } catch (error) {
    return apiFormError(error);
  }

  revalidatePath("/teach/invitations");
  revalidatePath("/teach/batches");
  revalidatePath("/teach", "layout");
  redirect("/teach/invitations");
}

/**
 * Declaring time away.
 *
 * ── Why the whole day, and why `endsAt` is inclusive ───────────────────
 *
 * A trainer blocks days, not hours — "I am away the 14th to the 16th" — so the
 * form takes two dates and this turns them into the instants the column wants,
 * with the end pushed to the close of that day. A literal midnight-to-midnight
 * read of "14th to 16th" would leave the 16th bookable, which is exactly the
 * day they said they were away.
 */
export async function declareLeave(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const from = formData.get("startsAt");
  const to = formData.get("endsAt");
  if (typeof from !== "string" || from === "" || typeof to !== "string" || to === "") {
    return formError("Say which days you are away.");
  }
  if (to < from) {
    return formError("Check the dates.", { endsAt: "It must end on or after it starts" });
  }

  const reason = formData.get("reason");
  const trainer = await apiFetch<{ trainerId: string }>("/me/trainer");

  try {
    await apiFetch(`/trainers/${encodeURIComponent(trainer.trainerId)}/availability`, {
      method: "POST",
      body: {
        type: "LEAVE",
        startsAt: `${from}T00:00:00.000Z`,
        endsAt: `${to}T23:59:59.999Z`,
        isFullDay: true,
        ...(typeof reason === "string" && reason.trim() !== "" ? { reason: reason.trim() } : {}),
      },
    });
  } catch (error) {
    // A collision with a confirmed session lands here, naming the batch and
    // the date. That refusal is the point — see the screen.
    return apiFormError(error);
  }

  revalidatePath("/teach/availability");
  redirect("/teach/availability");
}
