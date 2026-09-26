"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Principal } from "@gurukulam/contracts";

import { Icon } from "@/components/ui/icon";
import { logout } from "@/features/auth/server/actions";
import { cn } from "@/lib/cn";

export interface TopBarProps {
  principal: Principal;
  /** Situations needing a decision. Absent until the count has loaded. */
  actionCount?: number;
}

/**
 * Describes the principal's reach in one line, because "Regional Admin" alone
 * does not tell an operator whether they are looking at the whole country or
 * one city — and a report that silently covers less than expected is the kind
 * of thing nobody notices.
 */
function scopeLabel(principal: Principal): string {
  if (principal.collegeScope !== null) return "College";
  if (principal.cityScope === null) return "All regions";
  if (principal.cityScope.length === 0) return "No regions";
  const n = principal.cityScope.length;
  return `${n} ${n === 1 ? "region" : "regions"}`;
}

/** "Aarav Menon" → "AM"; "Priya" → "P". First and last, so a middle name does not displace the surname. */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

export function TopBar({ principal, actionCount }: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // A click anywhere else closes the menu, and Escape closes it from the
  // keyboard — a menu that can only be dismissed by clicking its own trigger
  // is a trap for anyone not using a mouse.
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-20 flex h-topbar items-center justify-between gap-6 border-b border-hairline bg-canvas px-4 sm:px-8">
      <div className="relative min-w-0 max-w-[576px] flex-1">
        <Icon
          name="search"
          size={18}
          className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-subtle"
        />
        <label htmlFor="global-search" className="sr-only">
          Search students, colleges, batches, ledgers
        </label>
        <input
          id="global-search"
          type="search"
          placeholder="Search students, colleges, batches, ledgers…"
          className="h-12 w-full rounded-full border border-hairline-strong bg-surface pr-4 pl-11 text-body text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none"
        />
      </div>

      <div className="flex shrink-0 items-center gap-4 sm:gap-5">
        <Link
          href="/notifications"
          aria-label={
            actionCount === undefined
              ? "Notifications"
              : `Notifications — ${actionCount} need action`
          }
          className="relative grid size-10 place-items-center rounded-full text-ink-muted transition-colors hover:bg-ink/5"
        >
          <Icon name="bell" size={20} />
          {actionCount !== undefined && actionCount > 0 ? (
            <span className="absolute top-0.5 right-0.5 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-danger px-1 text-overline text-white ring-2 ring-canvas">
              {actionCount}
            </span>
          ) : null}
        </Link>

        <div ref={menuRef} className="relative border-l border-hairline pl-4">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className="flex cursor-pointer items-center gap-3 rounded-control py-1.5 pr-2 text-left hover:bg-ink/5"
          >
            <span className="hidden flex-col items-end sm:flex">
              <span className="text-body text-ink">{principal.name}</span>
              <span className="text-overline text-ink-muted uppercase">
                {principal.roleName ?? "Administrator"}
              </span>
            </span>
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-glow font-bold text-gold ring-2 ring-surface">
              {initialsOf(principal.name)}
            </span>
            <Icon name="chev" size={16} className="text-ink-subtle" />
          </button>

          {menuOpen ? (
            <div
              role="menu"
              className="absolute top-[calc(100%+8px)] right-0 z-50 min-w-[236px] rounded-well border border-hairline bg-surface p-2 shadow-floating"
            >
              <div className="mb-1.5 border-b border-hairline px-3 pt-2.5 pb-3">
                <span className="block text-body font-semibold text-ink">{principal.name}</span>
                <span className="block text-caption text-ink-subtle">
                  {principal.roleName ?? "Administrator"} · {scopeLabel(principal)}
                </span>
              </div>

              <MenuLink href="/account" icon="acct">
                My account
              </MenuLink>
              <MenuLink href="/settings" icon="gear">
                Settings
              </MenuLink>

              <div className="my-1.5 h-px bg-hairline" />

              {/*
                A form, not a link: signing out revokes a refresh token, and a
                GET that changes state is one prefetch away from doing it by
                accident.
              */}
              <form action={logout}>
                <button
                  type="submit"
                  role="menuitem"
                  className="flex w-full items-center gap-2.5 rounded-control px-3 py-2.5 text-left text-body-sm text-danger hover:bg-surface-sunken"
                >
                  <Icon name="back" size={17} />
                  Sign out
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function MenuLink({
  href,
  icon,
  children,
}: {
  href: "/account" | "/settings";
  icon: "acct" | "gear";
  children: string;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      className={cn(
        "flex w-full items-center gap-2.5 rounded-control px-3 py-2.5 text-body-sm text-ink hover:bg-surface-sunken",
      )}
    >
      <Icon name={icon} size={17} />
      {children}
    </Link>
  );
}
