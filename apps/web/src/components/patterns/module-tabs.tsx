"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { navItemFor } from "@/config/navigation";
import { cn } from "@/lib/cn";

/**
 * The pages inside the current module, as a tab strip under the page header.
 *
 * It reads the same list the rail discloses, so the two can never disagree —
 * and collapsed, where the rail shows only icons, this is the only way to reach
 * a module's other pages.
 *
 * Renders nothing for a module with no second page.
 */
export function ModuleTabs({ className }: { className?: string }) {
  const pathname = usePathname();
  const children = navItemFor(pathname)?.children;

  if (children === undefined || children.length < 2) return null;

  return (
    <nav
      aria-label="Pages in this module"
      className={cn(
        "flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-surface-muted p-1",
        className,
      )}
    >
      {children.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full px-4.5 py-2 text-body-sm font-medium whitespace-nowrap transition-colors",
              active
                ? "bg-surface text-ink shadow-raised"
                : "text-ink-muted hover:text-ink",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
