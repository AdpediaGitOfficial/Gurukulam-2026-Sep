"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import type { NavItem } from "@/config/navigation";
import { cn } from "@/lib/cn";

export interface NavRailLinkProps {
  item: NavItem;
}

/**
 * The only client component in the rail — it needs the current pathname to
 * resolve its active state. Everything around it stays a server component.
 */
export function NavRailLink({ item }: NavRailLinkProps) {
  const pathname = usePathname();
  const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

  return (
    <Link
      href={item.href}
      aria-label={item.label}
      aria-current={isActive ? "page" : undefined}
      title={item.label}
      className={cn(
        "flex size-10 items-center justify-center rounded-full transition-colors",
        isActive
          ? "bg-accent text-on-accent"
          : "text-white/70 hover:bg-white/15 hover:text-white",
      )}
    >
      <Icon name={item.icon} />
    </Link>
  );
}
