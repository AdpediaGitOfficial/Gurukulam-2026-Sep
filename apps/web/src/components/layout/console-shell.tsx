"use client";

import { useState, type ReactNode } from "react";
import type { Principal } from "@gurukulam/contracts";

import { NavigationRail } from "@/components/layout/navigation-rail";
import { TopBar } from "@/components/layout/top-bar";
import { ModuleTabs } from "@/components/patterns/module-tabs";
import { cn } from "@/lib/cn";

export interface ConsoleShellProps {
  principal: Principal;
  children: ReactNode;
}

/**
 * Chrome shared by every console route: the navigation rail and the top bar.
 * Pages only ever render their own content.
 *
 * A client component, and the only one in the chrome, because the rail's
 * expanded state has to be shared: the rail draws it, and the content area's
 * left inset has to track it. `children` stays server-rendered — it is passed
 * through, not re-rendered here.
 */
export function ConsoleShell({ principal, children }: ConsoleShellProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cn(
        "min-h-dvh bg-canvas transition-[padding] duration-200 ease-out motion-reduce:transition-none",
        expanded ? "pl-rail-expanded" : "pl-rail",
      )}
    >
      <NavigationRail
        principal={principal}
        expanded={expanded}
        onToggleExpanded={() => setExpanded((open) => !open)}
      />

      <div className="flex min-h-dvh min-w-0 flex-col">
        <TopBar principal={principal} />
        <main id="main" className="mx-auto w-full max-w-content min-w-0 flex-1 px-4 pt-8 pb-16 sm:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
