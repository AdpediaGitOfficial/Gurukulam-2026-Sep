import type { Metadata } from "next";

import { Logo } from "@/components/ui/logo";
import { StudentLoginForm } from "@/features/me/components/student-login-form";

export const metadata: Metadata = { title: "Sign in — Gurukulam" };

/**
 * The portal's front door.
 *
 * Outside `(app)`, so it renders without the shell: a tab bar on a screen you
 * cannot yet navigate from is three controls that do nothing.
 *
 * The logo gets a rail-coloured plate for the same reason the console's
 * sign-in does — the wordmark is #ebedeb and measures about 1.04:1 on the
 * canvas, which is invisible rather than faint. Recolouring somebody's brand
 * asset to suit a light background is their decision, not this screen's.
 */
export default function StudentLoginPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 flex justify-center">
            <div className="rounded-panel bg-rail px-8 py-7 shadow-raised">
              <Logo variant="lockup" className="w-44 sm:w-52" />
            </div>
          </div>

          <div className="rounded-card border border-hairline bg-surface p-6 sm:p-8">
            <h1 className="text-h1 text-ink">Student portal</h1>
            <p className="mt-1 mb-6 text-body-sm text-ink-muted">
              Your classes, your recordings and your certificate.
            </p>
            <StudentLoginForm />
          </div>
        </div>
      </div>
    </div>
  );
}
