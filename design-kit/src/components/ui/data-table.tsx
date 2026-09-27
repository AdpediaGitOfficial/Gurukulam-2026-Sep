import type { ReactNode } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";

export interface Column<TRow> {
  /** Stable key, also used as the React key for header and body cells. */
  id: string;
  header: ReactNode;
  cell: (row: TRow) => ReactNode;
  /** Utility classes applied to both the header cell and every body cell. */
  className?: string;
  /** Right-align numeric columns. */
  align?: "start" | "end";
}

export interface DataTableProps<TRow> {
  columns: ReadonlyArray<Column<TRow>>;
  rows: readonly TRow[];
  getRowId: (row: TRow) => string;
  /** Visually hidden description of the table's purpose. */
  caption: string;
  /** Rendered in place of the table when `rows` is empty. */
  empty?: ReactNode;
  /** Minimum table width before the container scrolls horizontally. */
  minWidth?: string;
  className?: string;
}

/**
 * Presentational, generically typed table.
 *
 * It knows nothing about any particular domain — feature modules describe their
 * own columns, which keeps row rendering type-safe as new tables are added.
 */
export function DataTable<TRow>({
  columns,
  rows,
  getRowId,
  caption,
  empty,
  minWidth = "640px",
  className,
}: DataTableProps<TRow>) {
  if (rows.length === 0) {
    return <>{empty ?? <EmptyState title="Nothing here yet" description={caption} />}</>;
  }

  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <table className="w-full border-collapse text-left" style={{ minWidth }}>
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-sunken">
          <tr>
            {columns.map((column, index) => (
              <th
                key={column.id}
                scope="col"
                className={cn(
                  "px-4 py-3 text-caption font-bold tracking-wide text-ink-muted uppercase",
                  column.align === "end" && "text-right",
                  index === 0 && "rounded-l-control",
                  index === columns.length - 1 && "rounded-r-control",
                  column.className,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={getRowId(row)}
              className="border-b border-hairline transition-colors last:border-b-0 hover:bg-surface-sunken"
            >
              {columns.map((column) => (
                <td
                  key={column.id}
                  className={cn(
                    "px-4 py-4 align-middle text-body",
                    column.align === "end" && "text-right",
                    column.className,
                  )}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
