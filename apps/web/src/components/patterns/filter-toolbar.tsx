import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface FilterToolbarProps {
  /** A `SearchField`; grows to fill the row. */
  search?: ReactNode;
  /** `Select`s, chips or toggles that narrow the collection. */
  filters?: ReactNode;
  /** Row-level actions such as export or bulk edit. */
  actions?: ReactNode;
  className?: string;
}

/**
 * The control strip that sits above a collection. Keeping search, filters and
 * actions in fixed positions means every list page reads the same way.
 */
export function FilterToolbar({ search, filters, actions, className }: FilterToolbarProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      {search ? <div className="min-w-56 flex-1">{search}</div> : null}
      {filters ? <div className="flex flex-wrap items-center gap-3">{filters}</div> : null}
      {actions ? <div className="ml-auto flex items-center gap-3">{actions}</div> : null}
    </div>
  );
}
