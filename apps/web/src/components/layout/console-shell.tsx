import type { ReactNode } from "react";
import type { Principal } from "@gurukulam/contracts";

import { NavigationRail } from "@/components/layout/navigation-rail";
import { TopBar } from "@/components/layout/top-bar";

export interface ConsoleShellProps {
  principal: Principal;
  children: ReactNode;
}

/**
 * Chrome shared by every console route: the navigation rail and the top bar.
 * Pages only ever render their own content.
 */
export function ConsoleShell({ principal, children }: ConsoleShellProps) {
  return (
    <div className="min-h-dvh bg-canvas pl-rail">
      <NavigationRail principal={principal} />
      <div className="flex min-h-dvh flex-col">
        <TopBar principal={principal} />
        <main id="main" className="mx-auto w-full max-w-content flex-1 px-4 pt-8 pb-16 sm:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
