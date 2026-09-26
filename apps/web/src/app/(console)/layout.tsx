import type { ReactNode } from "react";

import { ConsoleShell } from "@/components/layout/console-shell";
import { requirePrincipal } from "@/server/principal";

/**
 * Every signed-in route renders inside this. Resolving the principal here means
 * one round trip for the whole page rather than one per module, and one place
 * that sends an expired session to `/auth/refresh`.
 */
export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const principal = await requirePrincipal();

  return <ConsoleShell principal={principal}>{children}</ConsoleShell>;
}
