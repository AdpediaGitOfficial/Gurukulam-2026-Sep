"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

/**
 * Active state for the college portal's two navigations.
 *
 * The third portal, and deliberately the same mechanism as the second: a light
 * rail where the active entry is a solid block of the portal's colour carrying
 * its dark ink. What differs is only which colour — indigo here, green there —
 * because a person who learned one portal should not have to learn another.
 */
function useIsActive(href: string): boolean {
  const pathname = usePathname();
  // `/campus` prefixes every route, so home must match exactly or it lights up
  // on every screen. The others own their subtrees.
  return href === "/campus" ? pathname === href : pathname.startsWith(href);
}

export function CampusNavLink({
  href,
  label,
  icon,
  badge = 0,
}: {
  href: string;
  label: string;
  icon: IconName;
  badge?: number;
}) {
  const active = useIsActive(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-11 items-center gap-3 rounded-control px-3 text-body-sm transition-colors",
        active
          ? "bg-campus font-semibold text-on-campus"
          : "text-ink-muted hover:bg-campus-soft hover:text-on-campus",
      )}
    >
      <Icon name={icon} size={20} />
      {label}
      {badge === 0 ? null : (
        <span
          className={cn(
            "ml-auto grid h-[18px] min-w-[18px] place-items-center rounded-full px-1.5 text-overline",
            // On the filled entry a danger red fights its ground, so the badge
            // borrows the entry's own ink — the same inversion both other
            // portal rails needed.
            active ? "bg-on-campus/20 text-on-campus" : "bg-danger text-white",
          )}
        >
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </Link>
  );
}

/** The phone tab. 56px of target, because a tab bar is thumb-reached. */
export function CampusTabLink({
  href,
  label,
  short,
  icon,
}: {
  href: string;
  label: string;
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
        active ? "font-semibold text-on-campus" : "text-ink-subtle hover:text-ink",
      )}
    >
      <Icon name={icon} size={22} />
      <span className="max-w-full truncate">{short ?? label}</span>
    </Link>
  );
}
