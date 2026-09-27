import type { ReactNode } from "react";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import type { SearchParams } from "@/lib/href";

export interface FilterSelect {
  /** Query-string key this select drives. */
  name: string;
  label: string;
  /** The first option is the unfiltered state and submits as empty. */
  options: ReadonlyArray<{ value: string; label: string }>;
}

export interface FilterDate {
  /** Query-string key this date drives. */
  name: string;
  label: string;
  /** Shown when the param is absent, so the form submits a real window. */
  defaultValue?: string;
}

export interface ListFiltersProps {
  /** Placeholder for the free-text search. Omit to leave search out. */
  searchPlaceholder?: string;
  selects?: readonly FilterSelect[];
  /** Date bounds, e.g. the window a calendar is read over. */
  dates?: readonly FilterDate[];
  /** The page's current searchParams, so filters survive one another. */
  params: SearchParams;
  /** Export, bulk actions — rendered at the end of the row. */
  actions?: ReactNode;
  className?: string;
}

const first = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value) ?? "";

/**
 * The control strip above a collection.
 *
 * A plain GET form, so narrowing a list is a navigation: the result is
 * shareable, the back button works, and the page stays server-rendered with no
 * client JavaScript involved in filtering. Submitting resets to page one, which
 * is why `page` is not carried forward.
 */
export function ListFilters({
  searchPlaceholder,
  selects = [],
  dates = [],
  params,
  actions,
  className,
}: ListFiltersProps) {
  return (
    <form method="get" className={cn("flex flex-wrap items-center gap-3", className)}>
      {/*
        Everything not shown as a control still has to survive the submit, or
        filtering a sorted list would silently throw the sort away.
      */}
      {Object.entries(params)
        .filter(
          ([key]) =>
            key !== "page" &&
            key !== "q" &&
            !selects.some((s) => s.name === key) &&
            !dates.some((d) => d.name === key),
        )
        .map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={first(value)} />
        ))}

      {searchPlaceholder === undefined ? null : (
        <div className="relative min-w-56 flex-1 sm:max-w-[420px]">
          <Icon
            name="search"
            size={18}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-subtle"
          />
          <label htmlFor="list-search" className="sr-only">
            {searchPlaceholder}
          </label>
          <input
            id="list-search"
            name="q"
            type="search"
            defaultValue={first(params["q"])}
            placeholder={searchPlaceholder}
            className="h-11 w-full rounded-control border border-hairline-strong bg-surface pr-3 pl-10 text-body text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none"
          />
        </div>
      )}

      {selects.map((select) => (
        <div key={select.name} className="min-w-0">
          <label htmlFor={`filter-${select.name}`} className="sr-only">
            {select.label}
          </label>
          {/*
            The select draws its own chevron: the native arrow cannot be
            positioned, so it left a dead gap after the text and never lined up
            with the search icon opposite it.
          */}
          <select
            id={`filter-${select.name}`}
            name={select.name}
            defaultValue={first(params[select.name])}
            className="h-11 max-w-full cursor-pointer appearance-none rounded-control border border-hairline-strong bg-surface bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2724%27%20height=%2724%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%236b7280%27%20stroke-width=%271.7%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3E%3Cpath%20d=%27M6%209l6%206%206-6%27/%3E%3C/svg%3E')] bg-[length:16px_16px] bg-[position:right_12px_center] bg-no-repeat py-0 pr-9 pl-3.5 text-body text-ink focus:border-brand focus:outline-none"
          >
            {select.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ))}

      {dates.map((date) => (
        <div key={date.name} className="flex items-center gap-2">
          {/*
            Labelled visibly, unlike the selects: "from" and "to" are only
            distinguishable by their label, and two bare date boxes side by side
            say nothing about which end is which.
          */}
          <label htmlFor={`filter-${date.name}`} className="text-body-sm text-ink-muted">
            {date.label}
          </label>
          <input
            id={`filter-${date.name}`}
            name={date.name}
            type="date"
            defaultValue={first(params[date.name]) || (date.defaultValue ?? "")}
            className="h-11 cursor-pointer rounded-control border border-hairline-strong bg-surface px-3.5 text-body text-ink focus:border-brand focus:outline-none"
          />
        </div>
      ))}

      <button
        type="submit"
        className="h-11 cursor-pointer rounded-full bg-surface-muted px-5 text-body font-medium text-ink transition-colors hover:bg-neutral"
      >
        Apply
      </button>

      {actions ? <div className="ml-auto flex items-center gap-3">{actions}</div> : null}
    </form>
  );
}
