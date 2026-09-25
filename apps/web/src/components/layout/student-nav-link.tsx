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
        // `on-accent` rather than white: amber cannot carry white text at any
        // accessible ratio, and the token pair exists so nobody has to
        // rediscover that per screen.
        active
          ? "bg-accent font-semibold text-on-accent"
          : "text-ink-muted hover:bg-surface-sunken hover:text-ink",
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
  short,
  icon,
}: {
  href: string;
  label: string;
  /** The tab's own word, where the sidebar's is too long. See `StudentNavEntry`. */
  short?: string;
  icon: IconName;
}) {
  const active = useIsActive(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-caption transition-colors",
        // The sidebar fills its active entry; a tab bar cannot without looking
        // like a button, so the same answer is given in ink weight and the
        // `gold` shade — amber's text-safe relative, at 4.9:1 on white.
        active ? "font-semibold text-gold" : "text-ink-subtle hover:text-ink",
      )}
    >
      <Icon name={icon} size={22} />
      <span className="max-w-full truncate">{short ?? label}</span>
    </Link>
  );
}
