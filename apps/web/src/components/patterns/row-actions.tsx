import Link from "next/link";

import type { Column } from "@/components/ui/data-table";
import { buttonVariants } from "@/components/ui/button";

export interface RowAction {
  label: string;
  href: string;
}

/**
 * The verbs on a row, as a table column.
 *
 * They sit on the row rather than behind a hidden menu: an operations team
 * correcting a record should not have to discover where the verb went, and a
 * kebab menu costs a click on every single edit.
 *
 * Returned as a `Column` so a list page adds it the way it adds any other
 * column — tables stay data, not markup.
 */
export function rowActions<TRow>(
  actions: (row: TRow) => readonly RowAction[],
): Column<TRow> {
  return {
    id: "actions",
    // The column is self-evident from its contents, and a header would read as
    // a sortable field. Announced to screen readers instead.
    header: <span className="sr-only">Actions</span>,
    align: "end",
    className: "w-px whitespace-nowrap",
    cell: (row) => (
      <span className="flex items-center justify-end gap-1">
        {actions(row).map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            {action.label}
          </Link>
        ))}
      </span>
    ),
  };
}
