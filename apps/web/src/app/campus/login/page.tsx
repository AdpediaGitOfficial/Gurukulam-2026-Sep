import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { CollegeLoginForm } from "@/features/campus/components/college-login-form";

export const metadata: Metadata = { title: "College sign in — Gurukulam" };

/**
 * The fourth door.
 *
 * Outside `(app)`, so it renders without the shell: a tab bar on a screen you
 * cannot navigate from is five controls that do nothing.
 */
export default function CollegeLoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-tile bg-ink">
            <Logo variant="mark" className="w-7" decorative />
          </span>
          <span className="min-w-0">
            <span className="block text-body font-semibold text-ink">Gurukulam</span>
            <span className="block text-overline text-ink-subtle uppercase">College</span>
          </span>
        </div>

        <h1 className="text-metric text-ink">Sign in</h1>
        <p className="mt-1 mb-6 text-body text-ink-muted">
          Your cohorts, your students, their certificates, and what the institution owes.
        </p>

        <CollegeLoginForm />

        <p className="mt-6 text-body-sm text-ink-subtle">
          No login yet? Your Gurukulam contact issues one to a named person at the college —{" "}
          <Link
            href="/portal/login"
            className="font-medium text-brand underline-offset-4 hover:underline"
          >
            a student signing in?
          </Link>
        </p>
      </div>
    </main>
  );
}
