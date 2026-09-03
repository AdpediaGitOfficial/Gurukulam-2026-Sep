import Link from "next/link";
import type { Route } from "next";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export interface PaginationProps {
  page: number;
  pageCount: number;
  /** Builds the URL for a given page — keeps filters in the query string. */
  hrefForPage: (page: number) => Route;
  /** Summary such as "Showing 1–20 of 342". */
  summary?: string;
  className?: string;
}

/**
 * Link-based pagination: every page is a real URL, so results are shareable and
 * the list stays server-rendered.
 */
export function Pagination({ page, pageCount, hrefForPage, summary, className }: PaginationProps) {
  if (pageCount <= 1) return null;

  const hasPrevious = page > 1;
  const hasNext = page < pageCount;
  // Same filled grey pill as any other inactive action.
  const stepClass = buttonVariants({ variant: "secondary", size: "sm" });

  return (
    <nav
      aria-label="Pagination"
      className={cn("flex flex-wrap items-center justify-between gap-4", className)}
    >
      <p className="text-body-sm text-ink-muted">
        {summary ?? `Page ${page} of ${pageCount}`}
      </p>

      <div className="flex items-center gap-2">
        {hasPrevious ? (
          <Link href={hrefForPage(page - 1)} rel="prev" className={stepClass}>
            Previous
          </Link>
        ) : (
          <span aria-disabled className={cn(stepClass, "pointer-events-none opacity-50")}>
            Previous
          </span>
        )}

        {hasNext ? (
          <Link href={hrefForPage(page + 1)} rel="next" className={stepClass}>
            Next
          </Link>
        ) : (
          <span aria-disabled className={cn(stepClass, "pointer-events-none opacity-50")}>
            Next
          </span>
        )}
      </div>
    </nav>
  );
}
