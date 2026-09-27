"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";

import { cn } from "@/lib/cn";

export interface TabItem {
  href: Route;
  label: string;
  /** Optional trailing count, e.g. the number of records in that view. */
  count?: number;
}

export interface TabsProps {
  items: readonly TabItem[];
  className?: string;
}

/**
 * Route-driven tabs. Each tab is a real link, so views are deep-linkable,
 * shareable and server-rendered — no client tab state to keep in sync.
 */
export function Tabs({ items, className }: TabsProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Section"
      className={cn("flex gap-1 overflow-x-auto border-b border-hairline", className)}
    >
      {items.map((item) => {
        const isActive = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-body-sm whitespace-nowrap transition-colors",
              isActive
                ? "border-brand font-semibold text-brand"
                : "border-transparent text-ink-muted hover:border-hairline hover:text-ink",
            )}
          >
            {item.label}
            {item.count === undefined ? null : (
              <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-caption text-ink-muted">
                {item.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
