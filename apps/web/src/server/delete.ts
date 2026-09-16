"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { apiFetch } from "@/server/api";
import { apiFormError } from "@/lib/action";
import type { FormState } from "@/lib/form";

/**
 * Removing a record, for every module that offers it.
 *
 * **Deletion is SOFT everywhere.** The API sets `deleted_at` and keeps the
 * row, because a deleted student's historical collections still happened and a
 * retired course still explains the batches that ran under it. Nothing here
 * destroys anything.
 *
 * **Every refusal already lives in the API**, and they are specific: a college
 * with live students refuses, a course with a running batch refuses, a student
 * who has paid refuses, a role somebody holds refuses, a contract with money
 * collected refuses and tells you to cancel it instead. So the console's job
 * is not to reimplement those rules — it is to offer the verb and put the
 * refusal in front of the operator in the API's own words. A second copy of
 * the rule here would drift from the one that is actually enforced.
 *
 * ── Why a registry rather than a path ────────────────────────────────────
 *
 * The obvious shape is `deleteRecord(path, id)` with the path bound at the
 * call site. But a bound argument travels to the browser and back, so the
 * thing naming which URL to DELETE would be round-tripping through the client.
 * Next encrypts those arguments, and that is still the wrong thing to rest on:
 * one framework change, one mistake, and the parameter that selects an API
 * endpoint to delete is attacker-controlled.
 *
 * A KEY cannot be abused that way. Anything that is not one of these names
 * resolves to nothing and the action refuses. The union also makes the
 * compiler check every call site, so a typo is a build failure rather than a
 * button that quietly does nothing.
 */
const TARGETS = {
  college: {
    noun: "college",
    path: (id: string) => `/colleges/${id}`,
    revalidate: ["/colleges"],
  },
  course: {
    noun: "course",
    path: (id: string) => `/courses/${id}`,
    revalidate: ["/courses"],
  },
  question: {
    noun: "question",
    path: (id: string) => `/courses/question-bank/${id}`,
    revalidate: ["/courses/question-bank"],
  },
  contract: {
    noun: "contract",
    path: (id: string) => `/fee-ledger/contracts/${id}`,
    revalidate: ["/fee-ledger/contracts"],
  },
  jobPosting: {
    noun: "job posting",
    path: (id: string) => `/hiring/${id}`,
    revalidate: ["/hiring"],
  },
  city: {
    noun: "city",
    path: (id: string) => `/localisation/cities/${id}`,
    revalidate: ["/settings/cities"],
  },
  country: {
    noun: "country",
    path: (id: string) => `/localisation/countries/${id}`,
    revalidate: ["/settings/countries", "/settings/cities"],
  },
  administrator: {
    noun: "administrator",
    path: (id: string) => `/settings/administrators/${id}`,
    revalidate: ["/settings/administrators"],
  },
  role: {
    noun: "role",
    path: (id: string) => `/settings/roles/${id}`,
    revalidate: ["/settings/roles", "/settings/administrators"],
  },
  student: {
    noun: "student",
    path: (id: string) => `/students/${id}`,
    revalidate: ["/students", "/students/unallocated"],
  },
  trainer: {
    noun: "trainer",
    path: (id: string) => `/trainers/${id}`,
    revalidate: ["/trainers"],
  },
  /**
   * A scheduled session. The API refuses a COMPLETED one — delivery history is
   * not a thing to tidy away — and says to cancel a future session instead,
   * which notifies the roster. That refusal appears on the row.
   */
  session: {
    noun: "session",
    path: (id: string) => `/batches/sessions/${id}`,
    revalidate: ["/batches", "/batches/sessions"],
  },
  assignment: {
    noun: "assignment",
    path: (id: string) => `/batches/assignments/${id}`,
    revalidate: ["/batches/sessions"],
  },
  availability: {
    noun: "availability window",
    path: (id: string) => `/trainers/availability/${id}`,
    revalidate: ["/trainers", "/trainers/calendar"],
  },
} as const;

export type DeleteTarget = keyof typeof TARGETS;

/**
 * Soft-deletes one record and refreshes the lists it appears on.
 *
 * `redirectTo` is for a DETAIL page, which cannot stay on screen once its
 * record is gone. A row in a list passes nothing and the list simply
 * re-renders without it.
 */
export async function deleteRecord(
  target: DeleteTarget,
  id: string,
  redirectTo: string | null,
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  const config = TARGETS[target];
  // A key that is not in the registry: refuse rather than construct a URL out
  // of whatever arrived.
  if (config === undefined) {
    return { status: "error", message: "That is not something this console can remove." };
  }

  try {
    await apiFetch(config.path(id), { method: "DELETE" });
  } catch (error) {
    // The API's own refusal, in its own words — "This college still has 49
    // students" is worth more than "could not delete".
    return apiFormError(error);
  }

  for (const path of config.revalidate) revalidatePath(path);
  if (redirectTo !== null) redirect(redirectTo);
  return { status: "idle" };
}
