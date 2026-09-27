import type { ReactNode } from "react";

import { Logo } from "@/components/ui/logo";

/**
 * The signed-out shell. No rail and no top bar — there is no principal yet, so
 * there is nothing to navigate.
 *
 * ── Why the logo gets a plate ───────────────────────────────────────────
 *
 * This is the one screen with room for the full lockup, and the only screen a
 * person sees before they are anybody — so it is where the brand should be
 * whole rather than reduced to a 40px mark.
 *
 * The artwork cannot sit on the page itself: its wordmark is #ebedeb, which
 * against the canvas measures about 1.04:1 and is invisible, not merely faint.
 * A rust plate is the honest fix — the logo appears exactly as it was drawn,
 * on the ground it was drawn for, instead of being recoloured to suit a screen
 * it was not made for. Recolouring somebody's brand is their call, not ours.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 flex justify-center">
            {/* The plate is sized by the logo rather than the other way round,
                so the artwork keeps its own margins at every width. The lockup
                steps up on wider screens and stops at 176px on a phone —
                below roughly 170px the tagline stops being legible, and a
                tagline nobody can read is decoration. */}
            <div className="rounded-panel bg-rail px-8 py-7 shadow-raised">
              <Logo variant="lockup" className="w-44 sm:w-52" />
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
