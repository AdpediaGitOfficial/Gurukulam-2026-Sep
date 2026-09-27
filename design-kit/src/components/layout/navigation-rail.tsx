import Link from "next/link";

import { NavRailLink } from "@/components/layout/nav-rail-link";
import { Icon } from "@/components/ui/icon";
import { primaryNavItems, secondaryNavItems } from "@/config/navigation";
import { site } from "@/config/site";

export function NavigationRail() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-y-0 left-0 z-30 flex w-rail flex-col items-center overflow-y-auto bg-rail py-8"
    >
      <Link href="/" className="flex flex-col items-center gap-1" aria-label={`${site.name} home`}>
        <span className="flex size-10 items-center justify-center rounded-tile bg-accent text-on-accent">
          <Icon name="brand-mark" />
        </span>
        <span className="text-center text-[8px] leading-2 font-bold tracking-[-0.4px] text-white uppercase">
          {site.shortName.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </span>
      </Link>

      <ul className="mt-10 flex flex-1 flex-col items-center gap-[26.7px]">
        {primaryNavItems.map((item) => (
          <li key={item.href}>
            <NavRailLink item={item} />
          </li>
        ))}
      </ul>

      <ul className="flex flex-col items-center gap-4 pt-6">
        {secondaryNavItems.map((item) => (
          <li key={item.href}>
            <NavRailLink item={item} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
