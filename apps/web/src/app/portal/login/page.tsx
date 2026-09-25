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
 * The mark sits on a dark tile, the same one the signed-in sidebar uses. The
 * artwork's wordmark is #ebedeb and measures about 1.04:1 on the canvas —
 * invisible rather than faint — so on a light screen it needs a ground of its
 * own. Recolouring somebody's brand asset to suit a light background is their
 * decision, not this screen's.
 */
export default function StudentLoginPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 flex flex-col items-center gap-3">
            <span className="grid size-14 place-items-center rounded-well bg-ink">
              <Logo variant="mark" className="w-8" decorative />
            </span>
            <span className="text-center">
              <span className="block text-h2 text-ink">Gurukulam</span>
              <span className="block text-overline text-ink-subtle uppercase">Student portal</span>
            </span>
          </div>

          <div className="rounded-card border border-hairline bg-surface p-6 sm:p-8">
            <h1 className="text-h1 text-ink">Sign in</h1>
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
