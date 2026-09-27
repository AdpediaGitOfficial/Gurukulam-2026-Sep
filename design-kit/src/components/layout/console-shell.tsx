import type { ReactNode } from "react";

import { NavigationRail } from "@/components/layout/navigation-rail";
import { TopBar, type TopBarUser } from "@/components/layout/top-bar";

export interface ConsoleShellProps {
  user: TopBarUser;
  children: ReactNode;
}

/**
 * Chrome shared by every console route: the navigation rail and the top bar.
 * Pages only ever render their own content.
 */
export function ConsoleShell({ user, children }: ConsoleShellProps) {
  return (
    <div className="min-h-dvh bg-canvas pl-rail">
      <NavigationRail />
      <div className="flex min-h-dvh flex-col">
        <TopBar user={user} />
        <main id="main" className="mx-auto w-full max-w-content flex-1 px-4 pt-8 pb-16 sm:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
