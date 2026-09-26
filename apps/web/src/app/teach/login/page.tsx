import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { TrainerLoginForm } from "@/features/teach/components/trainer-login-form";
export const metadata: Metadata = { title: "Trainer sign in — Gurukulam" };

/**
 * The third door.
 *
 * Outside `(app)`, so it renders without the shell: a tab bar on a screen you
 * cannot yet navigate from is five controls that do nothing.
 *
 * The actor is part of the credential, so a trainer typing the right password
 * at the console's form would be told it does not match. Each surface has its
 * own, and the actor is fixed by the server action rather than posted from the
 * browser.
 */
export default function TrainerLoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-tile bg-ink">
            <Logo variant="mark" className="w-7" decorative />
          </span>
          <span className="min-w-0">
            <span className="block text-body font-semibold text-ink">Gurukulam</span>
            <span className="block text-overline text-ink-subtle uppercase">Trainer</span>
          </span>
        </div>

        <h1 className="text-metric text-ink">Sign in</h1>
        <p className="mt-1 mb-6 text-body text-ink-muted">
          Your schedule, your cohorts, and the registers waiting to be taken.
        </p>

        <TrainerLoginForm />

        <p className="mt-6 text-body-sm text-ink-subtle">
          Teaching here but no login yet? The office issues it —{" "}
          <Link href="/portal/login" className="font-medium text-brand underline-offset-4 hover:underline">
            looking for the student portal?
          </Link>
        </p>
      </div>
    </main>
  );
}
