"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { can, type Principal } from "@gurukulam/contracts";

import { Icon } from "@/components/ui/icon";
import { primaryNavItems, secondaryNavItems, navItemFor, type NavItem } from "@/config/navigation";
import { site } from "@/config/site";
import { cn } from "@/lib/cn";

export interface NavigationRailProps {
  principal: Principal;
  /** Owned by the shell, because the content area's inset tracks it. */
  expanded: boolean;
  onToggleExpanded: () => void;
}

/**
 * The primary rail: eleven destinations, collapsed to icons by default and
 * expanded to labels on request.
 *
 * It shows only what this principal can read — a regional sub-admin without
 * Hiring sees eight entries, not nine with one that refuses them. This is
 * presentation only; the API decides access and would refuse the route just the
 * same if the entry were shown.
 */
export function NavigationRail({ principal, expanded, onToggleExpanded }: NavigationRailProps) {
  const pathname = usePathname();

  /**
   * One sub-menu open at a time. Moving to a different module opens that
   * module's and closes the rest; moving between pages inside a module leaves a
   * manual toggle alone.
   */
  const current = navItemFor(pathname);
  const [openModule, setOpenModule] = useState<string | undefined>(current?.module);
  const [lastModule, setLastModule] = useState<string | undefined>(current?.module);

  useEffect(() => {
    if (current?.module !== lastModule) {
      setLastModule(current?.module);
      setOpenModule(current?.module);
    }
  }, [current?.module, lastModule]);

  const visible = (items: readonly NavItem[]) =>
    items.filter((item) => can(principal, item.module, "read"));

  return (
    <nav
      aria-label="Primary"
      data-expanded={expanded ? "true" : undefined}
      className={cn(
        "group/rail fixed inset-y-0 left-0 z-30 flex flex-col overflow-x-hidden overflow-y-auto bg-rail",
        "transition-[width] duration-200 ease-out motion-reduce:transition-none",
        expanded ? "w-rail-expanded" : "w-rail",
      )}
    >
      {/*
        Collapsed, the rail is 80px — too narrow for a 40px mark, a gap and a
        32px toggle in one row, which crushed the mark's box and overlapped the
        two. Stacked while collapsed, side by side once there is room.
      */}
      <div
        className={cn(
          "flex items-center gap-2.5 px-2 pt-6 pb-2.5",
          expanded ? "min-h-[88px] flex-row gap-3 px-4" : "flex-col",
        )}
      >
        <Link
          href="/dashboard"
          aria-label={`${site.name} home`}
          className={cn("flex min-w-0 items-center gap-3", expanded && "flex-1")}
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-tile bg-accent text-on-accent">
            <Icon name="mark" size={22} />
          </span>
          {expanded ? (
            <span className="min-w-0">
              <span className="block truncate text-body font-bold tracking-[-0.2px] text-white">
                {site.name}
              </span>
              <span className="block truncate text-overline text-white/70 uppercase">
                Training console
              </span>
            </span>
          ) : null}
        </Link>

        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} navigation`}
          className="grid size-8 shrink-0 place-items-center rounded-control text-white opacity-75 hover:bg-white/15 hover:opacity-100"
        >
          <Icon name={expanded ? "back" : "menu"} size={18} />
        </button>
      </div>

      <ul className="flex flex-1 flex-col gap-1 p-2">
        {expanded ? <RailSection>Modules</RailSection> : null}
        {visible(primaryNavItems).map((item) => (
          <RailEntry
            key={item.href}
            item={item}
            pathname={pathname}
            expanded={expanded}
            open={openModule === item.module}
            onToggle={() =>
              setOpenModule((open) => (open === item.module ? undefined : item.module))
            }
          />
        ))}
      </ul>

      <ul className="mt-2 flex flex-col gap-1 border-t border-white/15 p-2 pb-6">
        {expanded ? <RailSection>System</RailSection> : null}
        {visible(secondaryNavItems).map((item) => (
          <RailEntry
            key={item.href}
            item={item}
            pathname={pathname}
            expanded={expanded}
            open={openModule === item.module}
            onToggle={() =>
              setOpenModule((open) => (open === item.module ? undefined : item.module))
            }
          />
        ))}
      </ul>
    </nav>
  );
}

function RailSection({ children }: { children: string }) {
  return (
    <li className="px-3 pt-4 pb-1.5 text-overline text-white/50 uppercase">{children}</li>
  );
}

interface RailEntryProps {
  item: NavItem;
  pathname: string;
  expanded: boolean;
  open: boolean;
  onToggle: () => void;
}

function RailEntry({ item, pathname, expanded, open, onToggle }: RailEntryProps) {
  const active = navItemFor(pathname)?.href === item.href;
  const children = item.children;

  const link = (
    <Link
      href={item.href}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group/link relative flex h-11 min-w-0 flex-1 items-center gap-3 rounded-tile px-2.5 whitespace-nowrap text-white transition-colors",
        active ? "bg-white/20 font-semibold opacity-100" : "opacity-75 hover:bg-white/15 hover:opacity-100",
      )}
    >
      {active ? (
        <span
          aria-hidden
          className="absolute top-2.5 bottom-2.5 -left-2 w-[3px] rounded-r-[3px] bg-accent"
        />
      ) : null}

      <Icon name={item.icon} size={22} className={cn(!expanded && "mx-auto")} />
      {expanded ? (
        <span className="overflow-hidden text-body-sm font-medium text-ellipsis">{item.label}</span>
      ) : null}

      {/*
        Collapsed, a module's children are unreachable from the rail, so the
        tooltip says how many it has; the page's own tab strip carries them.
      */}
      {expanded ? null : (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-[60px] z-40 rounded-chip bg-ink px-2 py-1 text-caption text-white opacity-0 transition-opacity group-hover/link:opacity-100"
        >
          {item.label}
          {children === undefined ? null : (
            <span className="block text-overline font-normal opacity-70">
              {children.length} pages
            </span>
          )}
        </span>
      )}
    </Link>
  );

  if (children === undefined) return <li>{link}</li>;

  return (
    <li>
      <div className="flex items-center">
        {link}
        {/* A separate control: the label navigates, the chevron only discloses. */}
        {expanded ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={`sub-${item.module}`}
            aria-label={`${open ? "Collapse" : "Expand"} ${item.label} pages`}
            className="mr-1.5 grid size-7 shrink-0 place-items-center rounded-control text-white opacity-60 hover:bg-white/15 hover:opacity-100"
          >
            <Icon
              name="chev"
              size={15}
              className={cn("transition-transform motion-reduce:transition-none", open && "rotate-180")}
            />
          </button>
        ) : null}
      </div>

      {expanded && open ? (
        <div id={`sub-${item.module}`} className="flex flex-col gap-0.5 pt-0.5 pb-1.5 pl-[34px]">
          {children.map((child) => (
            <Link
              key={child.href}
              href={child.href}
              aria-current={pathname === child.href ? "page" : undefined}
              className={cn(
                "block truncate rounded-control px-2.5 py-1.5 text-body-sm whitespace-nowrap",
                pathname === child.href
                  ? "bg-white/15 font-semibold text-white"
                  : "text-white/70 hover:bg-white/10 hover:text-white",
              )}
            >
              {child.label}
            </Link>
          ))}
        </div>
      ) : null}
    </li>
  );
}
