"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

/**
 * Active state for the trainer's two navigations.
 *
 * ── Why selection is the DARKEST thing in the rail ─────────────────────
 *
 * On the console's dark rail the selected entry is the brightest. On a light
 * rail that inverts: the green ground is already the bright thing, so the
 * active entry is a solid block of it with the deep green-black ink the
 * contrast table calls for. Brightening it further would make selection
 * invisible.
 */
function useIsActive(href: string): boolean {
  const pathname = usePathname();
  // `/teach` is every route's prefix, so the dashboard must match exactly or
  // it lights up everywhere. The others own their subtrees.
  return href === "/teach" ? pathname === href : pathname.startsWith(href);
}

export function TrainerNavLink({
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
          ? "bg-teach font-semibold text-on-teach"
          : "text-ink-muted hover:bg-teach-soft hover:text-on-teach",
      )}
    >
      <Icon name={icon} size={20} />
      {label}
      {badge === 0 ? null : (
        <span
          className={cn(
            "ml-auto grid h-[18px] min-w-[18px] place-items-center rounded-full px-1.5 text-overline",
            // On the green active entry the danger red fights its ground, so
            // the badge borrows the entry's own ink — the same inversion the
            // student rail's amber needed.
            active ? "bg-on-teach/20 text-on-teach" : "bg-danger text-white",
          )}
        >
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </Link>
  );
}

/**
 * The phone tab.
 *
 * A 56px target — a trainer marking a register is standing in a room holding a
 * phone, which puts a harder floor under this than a desk does.
 */
export function TrainerTabLink({
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
        // A tab bar cannot fill its active entry without looking like a
        // button, so the answer is weight and the rail's own ink.
        active ? "font-semibold text-on-teach" : "text-ink-subtle hover:text-ink",
      )}
    >
      <Icon name={icon} size={22} />
      <span className="max-w-full truncate">{short ?? label}</span>
    </Link>
  );
}
