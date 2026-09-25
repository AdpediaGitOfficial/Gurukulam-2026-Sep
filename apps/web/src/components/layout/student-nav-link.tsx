"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

/**
 * Active state for the portal's two navigations.
 *
 * ── Why a client component ──────────────────────────────────────────────
 *
 * The same reason `NavRailLink` is one in the console: the active entry
 * depends on the current path, and reading it on the server would mean the
 * whole shell re-rendered on every navigation. This is the smallest thing
 * that has to know, so it is the only thing that opts in.
 *
 * ── Why `/portal` is matched exactly ────────────────────────────────────
 *
 * Every route in the portal starts with `/portal`, so a prefix match would
 * light Home up on every screen. Home is the one entry that has to be exact;
 * the others own their subtrees, because a batch page under `/portal/learning`
 * is still My learning.
 */
function useIsActive(href: string): boolean {
  const pathname = usePathname();
  return href === "/portal" ? pathname === href : pathname.startsWith(href);
}

export function StudentNavLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: IconName;
}) {
  const active = useIsActive(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-11 items-center gap-3 rounded-control px-3 text-body-sm transition-colors",
        active
          ? "bg-white/15 font-semibold text-white"
          : "text-white/75 hover:bg-white/10 hover:text-white",
      )}
    >
      <Icon name={icon} size={20} />
      {label}
    </Link>
  );
}

/**
 * The phone tab.
 *
 * A 56px target with the label always shown. Icon-only tabs save room and cost
 * a guess — three words is not what makes a portal feel cramped.
 */
export function StudentTabLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: IconName;
}) {
  const active = useIsActive(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-caption transition-colors",
        active ? "font-semibold text-rail" : "text-ink-subtle hover:text-ink",
      )}
    >
      <Icon name={icon} size={22} />
      <span className="max-w-full truncate">{label}</span>
    </Link>
  );
}
