import Link from "next/link";

import type { Column } from "@/components/ui/data-table";
import { buttonVariants } from "@/components/ui/button";
import { DeleteRecord } from "@/components/patterns/delete-record";
import type { DeleteTarget } from "@/server/delete";

export interface RowAction {
  label: string;
  href: string;
}

/** What removing THIS row would remove. */
export interface RowDelete {
  target: DeleteTarget;
  id: string;
  /** Named in the confirm — "Remove Sri Narayana College?" */
  label: string;
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
 *
 * `remove` is where Delete lives, for the same reason Edit does. It is
 * optional twice over: omitted entirely when the principal may not delete in
 * this module, and able to return null for a row that is not deletable even
 * when the module is. A page that omits it shows no Delete at all, which is
 * the correct answer for a read-only operator — not a button that 403s.
 */
export function rowActions<TRow>(
  actions: (row: TRow) => readonly RowAction[],
  remove?: (row: TRow) => RowDelete | null,
): Column<TRow> {
  return {
    id: "actions",
    // The column is self-evident from its contents, and a header would read as
    // a sortable field. Announced to screen readers instead.
    header: <span className="sr-only">Actions</span>,
    align: "end",
    className: "w-px whitespace-nowrap",
    cell: (row) => {
      const deletion = remove === undefined ? null : remove(row);
      return (
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
          {deletion === null ? null : (
            <DeleteRecord target={deletion.target} id={deletion.id} label={deletion.label} />
          )}
        </span>
      );
    },
  };
}
