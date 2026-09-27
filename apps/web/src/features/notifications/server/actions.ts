"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/server/api";

/**
 * Clears the FYI and ALERT rows.
 *
 * ACTION-REQUIRED rows are deliberately unaffected, by the API rather than by
 * anything here: those clear when their CONDITION does — the installment gets
 * paid, the trainer confirms — not when somebody looks at them. A queue you
 * can dismiss your way out of is a queue that stops meaning anything.
 *
 * Posted from a plain form in a Server Component, so marking read costs no
 * client JavaScript at all.
 */
export async function markAllNotificationsRead(): Promise<void> {
  await apiFetch("/notifications/read", { method: "POST", body: { all: true } });
  revalidatePath("/notifications");
  // The bell in the rail counts the same rows, so it has to be rebuilt too or
  // it keeps its badge until the next full navigation.
  revalidatePath("/", "layout");
}
