import Link from "next/link";
import type { Route } from "next";

import { cn } from "@/lib/cn";

export interface Crumb {
  label: string;
  /** Omit on the final crumb — the current page is not a link. */
  href?: Route;
}

export interface BreadcrumbsProps {
  items: readonly Crumb[];
  className?: string;
}

/**
 * Crumb links carry `py-1` so their hit area is 28px tall, clearing the 24px
 * minimum target size (WCAG 2.2 AA, 2.5.8) that bare inline text would miss.
 */
export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-2 text-body-sm text-ink-muted">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={item.label} className={cn("flex items-center gap-2")}>
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="inline-block py-1 underline-offset-4 hover:text-ink hover:underline"
                >
                  {item.label}
                </Link>
              ) : (
                <span aria-current={isLast ? "page" : undefined} className="text-ink">
                  {item.label}
                </span>
              )}
              {isLast ? null : (
                <span aria-hidden className="text-ink-subtle">
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
