import Link from "next/link";
import type { Principal } from "@gurukulam/contracts";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { SearchField } from "@/components/ui/input";
import { logout } from "@/features/auth/server/actions";
import { domainTokens } from "@/design-system/tokens";

export interface TopBarProps {
  principal: Principal;
}

/**
 * Describes the principal's reach in one line, because "Regional Admin" alone
 * does not tell an operator whether they are looking at the whole country or
 * one city — and a report that silently covers less than expected is the kind
 * of thing nobody notices.
 */
function scopeLabel(principal: Principal): string {
  const role = principal.roleName ?? "Administrator";
  if (principal.collegeScope !== null) return `${role} · College`;
  if (principal.cityScope === null) return `${role} · All cities`;
  if (principal.cityScope.length === 0) return `${role} · No cities`;
  return `${role} · ${principal.cityScope.length} ${principal.cityScope.length === 1 ? "city" : "cities"}`;
}

export function TopBar({ principal }: TopBarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-topbar items-center justify-between gap-6 border-b border-hairline bg-canvas px-4 sm:px-8">
      <SearchField
        id="global-search"
        label="Search cross-module analytics"
        placeholder="Search cross-module analytics..."
        fieldClassName="min-w-32 max-w-[576px] flex-1"
      />

      <div className="flex shrink-0 items-center gap-4 sm:gap-6">
        <Link
          href="/notifications"
          aria-label="Notifications"
          className="inline-flex size-10 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-ink/5"
        >
          <Icon name="bell" />
        </Link>

        <div className="flex items-center gap-3 border-l border-hairline pl-4">
          <Link href="/account" className="hidden flex-col items-end sm:flex">
            <span className="text-body text-ink">{principal.name}</span>
            <span className="text-overline text-ink-muted uppercase">{scopeLabel(principal)}</span>
          </Link>
          <Link href="/account" aria-label="Your account">
            <Avatar name={principal.name} ringColor={domainTokens["question-bank"]} />
          </Link>

          {/* A form, not a link: signing out revokes a refresh token, and a
              GET that changes state is one prefetch away from doing it by
              accident. */}
          <form action={logout}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
