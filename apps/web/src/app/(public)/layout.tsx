import type { ReactNode } from "react";
import Link from "next/link";

import { Logo } from "@/components/ui/logo";

/**
 * The one part of this product with no sign-in.
 *
 * ── Why it is a route group of its own ──────────────────────────────────
 *
 * Every other layout here calls `requirePrincipal` or `requireStudent`, which is
 * what stops a URL being a way to read a stranger's record. This group exists
 * precisely because one page must not: the reader of a verification page is an
 * employer checking somebody else's qualification, and a sign-in wall would mean
 * the only people who can verify a certificate are the people who issued it.
 *
 * Being its own group makes that explicit rather than incidental. A page added
 * here is public — that is what the folder means — so it is a decision somebody
 * has to make on purpose instead of a guard they forgot.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="border-b border-hairline bg-surface">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-4 lg:px-6">
          <span className="grid size-10 shrink-0 place-items-center rounded-tile bg-ink">
            <Logo variant="mark" className="w-6" decorative />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-body font-semibold text-ink">Gurukulam</span>
            <span className="block text-overline text-ink-subtle uppercase">
              Certificate check
            </span>
          </span>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 lg:px-6 lg:py-12">
        {children}
      </main>

      <footer className="border-t border-hairline bg-surface">
        <div className="mx-auto w-full max-w-2xl px-4 py-4 lg:px-6">
          <p className="text-body-sm text-ink-muted">
            A certificate is confirmed against our own register at the moment you check it.{" "}
            <Link href="/verify" className="font-medium text-brand underline-offset-4 hover:underline">
              Check another code
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
