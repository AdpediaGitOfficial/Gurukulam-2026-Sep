import type { ReactNode } from "react";

import { requirePrincipal } from "@/server/principal";

/**
 * Documents, not screens.
 *
 * A receipt is something a payer keeps: it is printed, saved as a PDF, and
 * attached to an email. So it renders on its own page rather than inside the
 * console shell — a rail and a search bar are not part of a receipt, and
 * fighting the shell with print rules is how a document ends up with a
 * navigation menu halfway down page two.
 *
 * It is still behind the same sign-in. `requirePrincipal` here is what stops a
 * receipt URL being a way to read a stranger's payment by guessing an id; the
 * service applies scope on top of that.
 */
export default async function DocumentLayout({ children }: { children: ReactNode }) {
  await requirePrincipal();
  return <div className="min-h-screen bg-surface-sunken print:bg-surface">{children}</div>;
}
