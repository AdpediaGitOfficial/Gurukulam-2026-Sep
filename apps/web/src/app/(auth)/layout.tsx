import type { ReactNode } from "react";

import { Icon } from "@/components/ui/icon";
import { site } from "@/config/site";

/**
 * The signed-out shell. No rail and no top bar — there is no principal yet, so
 * there is nothing to navigate.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 flex flex-col items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-tile bg-rail text-white">
              <Icon name="brand-mark" />
            </span>
            <span className="text-center text-caption font-bold tracking-[1px] text-ink-muted uppercase">
              {site.shortName.join(" ")}
            </span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
