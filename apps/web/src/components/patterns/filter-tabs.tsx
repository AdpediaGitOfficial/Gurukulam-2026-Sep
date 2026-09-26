"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { Suspense } from "react";

import { cn } from "@/lib/cn";

export interface FilterTab {
  /** Query value. The first tab is the default and renders without a param. */
  value: string;
  label: string;
  count?: number;
}

export interface FilterTabsProps {
  /** Query-string key these tabs drive, e.g. `status`. */
  param: string;
  tabs: readonly FilterTab[];
  className?: string;
}

/**
 * One pill. Rendered as a link when we know the URL, as plain text before
 * `useSearchParams` has resolved — the two are visually identical, so the
 * fallback does not flash or shift.
 */
function TabPill({
  tab,
  isActive,
  href,
}: {
  tab: FilterTab;
  isActive: boolean;
  href: Route | undefined;
}) {
  const className = cn(
    "flex shrink-0 items-center gap-2 rounded-full px-5 py-2 text-body transition-colors",
    // Every tab is a pill: unselected ones sit on a neutral grey, the
    // selected one on the accent. The selected label is `on-accent`,
    // not white — white on this amber is 1.9:1, well under the 4.5:1
    // needed to be readable.
    isActive
      ? "bg-accent font-semibold text-on-accent"
      : "bg-surface-muted text-ink-muted hover:bg-neutral hover:text-ink",
  );

  const content = (
    <>
      {tab.label}
      {tab.count === undefined ? null : (
        <span
          className={cn(
            "rounded-full px-2 text-caption font-bold tabular-nums",
            // A solid white chip in both states — the same treatment
            // `Chip variant="solid"` uses on the insight panels. A tinted
            // wash of the label colour was invisible against the amber.
            "bg-surface",
            isActive ? "text-on-accent" : "text-ink-muted",
          )}
        >
          {tab.count}
        </span>
      )}
    </>
  );

  if (href === undefined) {
    return (
      <span role="tab" aria-selected={isActive} className={className}>
        {content}
      </span>
    );
  }

  return (
    <Link href={href} role="tab" aria-selected={isActive} className={className}>
      {content}
    </Link>
  );
}

function TabList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      role="tablist"
      aria-label="Filter by status"
      // `min-w-0` is what lets `overflow-x-auto` engage: as a flex child the
      // tablist would otherwise size to its content and widen the page.
      className={cn("flex min-w-0 gap-2 overflow-x-auto", className)}
    >
      {children}
    </div>
  );
}

function FilterTabsLinks({ param, tabs, className }: FilterTabsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get(param) ?? tabs[0]?.value;

  const hrefFor = (value: string): Route => {
    const next = new URLSearchParams(searchParams);
    if (value === tabs[0]?.value) next.delete(param);
    else next.set(param, value);
    // Changing the filter invalidates the current page number.
    next.delete("page");
    const query = next.toString();
    return (query ? `${pathname}?${query}` : pathname) as Route;
  };

  return (
    <TabList className={className}>
      {tabs.map((tab) => (
        <TabPill
          key={tab.value}
          tab={tab}
          isActive={tab.value === active}
          href={hrefFor(tab.value)}
        />
      ))}
    </TabList>
  );
}

/**
 * Pill tabs that filter a collection through the URL.
 *
 * Each tab is a real link, so a filtered view is shareable, back/forward works,
 * and the page stays server-rendered. Use `Tabs` instead when the tabs navigate
 * between distinct routes rather than filtering one.
 *
 * The Suspense boundary lives here rather than at every call site. Reading the
 * query string opts a page out of static prerendering, and Next refuses to
 * build unless that bailout is bounded — putting the boundary in the component
 * that does the reading means no page can forget it.
 */
export function FilterTabs({ param, tabs, className }: FilterTabsProps) {
  return (
    <Suspense
      fallback={
        <TabList className={className}>
          {tabs.map((tab, index) => (
            <TabPill key={tab.value} tab={tab} isActive={index === 0} href={undefined} />
          ))}
        </TabList>
      }
    >
      <FilterTabsLinks param={param} tabs={tabs} className={className} />
    </Suspense>
  );
}
