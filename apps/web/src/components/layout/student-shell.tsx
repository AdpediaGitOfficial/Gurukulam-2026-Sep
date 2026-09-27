import type { ReactNode } from "react";
import Link from "next/link";
import type { Principal } from "@gurukulam/contracts";

import { Logo } from "@/components/ui/logo";
import { Icon, type IconName } from "@/components/ui/icon";
import { StudentNavLink, StudentTabLink } from "@/components/layout/student-nav-link";

/**
 * The student portal's frame.
 *
 * ── Why it does not look like the console ───────────────────────────────
 *
 * The operations console is a desk instrument: a terracotta rail 80px wide,
 * icon-first, nine modules deep, sitting beside tables that scroll inside
 * their own containers. `brand-guidelines.md` calls that rail structural, and
 * it stays exactly as it is — this file changes nothing about it.
 *
 * A portal is a different product for a different person. A student opens it
 * on a phone between classes with one question, and there are three places to
 * go rather than nine. So the frame recedes: a light sidebar the same colour
 * as a card, labels beside every icon, and colour spent on ONE thing — the
 * entry you are on, in amber.
 *
 * ── Why amber, and only there ───────────────────────────────────────────
 *
 * `accent` is already the product's attention colour, and `on-accent` is the
 * dark ink drawn to sit on it — the pair exists because amber cannot carry
 * white text at any accessible ratio. Using them for the active entry means
 * the portal spends its one strong colour on the one question a navigation
 * has to answer: where am I.
 */

export interface StudentNavEntry {
  href: string;
  label: string;
  icon: IconName;
  /**
   * What the phone tab says, when the sidebar's word is too long for it.
   *
   * A tab is a fifth of 390px and its label truncates, so "Assignments" would
   * arrive as "Assignment…" — a word cut mid-air, which is worse than a
   * shorter true one. The sidebar has 240px and no such problem, so it keeps
   * the name the rest of the product uses.
   */
  short?: string;
  /**
   * Whether this entry gets a phone tab.
   *
   * Eight destinations is one more than a 390px tab bar holds — each tab would
   * be 48px, and "Learning" truncates at that width. The bell is the one that
   * gives way, because a bell has a better home on a phone anyway: the title
   * bar, where every other product puts it. The sidebar, with 240px to spend,
   * lists it like anything else.
   */
  phone?: boolean;
}

/**
 * The entries that exist, in the order a student needs them.
 *
 * Every one leads to a screen that answers. An entry leading to a page that
 * does not is worse than a missing one: a student cannot tell "not built" from
 * "I tapped the wrong thing", and this repo's own audit fails a control that
 * does nothing.
 *
 * ── Why Fees depends on the reader ─────────────────────────────────────
 *
 * Invariant 3: billing follows segment, and a college student has no
 * individual ledger. Not an empty one — an empty Fees page reads as "you owe
 * nothing yet", when the truth is that it will never be theirs to owe. So the
 * entry is ABSENT for them rather than present and empty, which is the same
 * distinction the console's portal-access roll-up makes between a null and a
 * NONE.
 */
function navFor(segment: "RETAIL" | "COLLEGE"): readonly StudentNavEntry[] {
  return [
    { href: "/portal", label: "Home", icon: "dash" },
    { href: "/portal/learning", label: "Learning", icon: "book" },
    { href: "/portal/assignments", label: "Assignments", icon: "task", short: "Work" },
    { href: "/portal/certificates", label: "Certificates", icon: "seal", short: "Awards" },
    { href: "/portal/jobs", label: "Jobs", icon: "brief" },
    // Reached from the bell on a phone. See `phone` on the entry type.
    { href: "/portal/notifications", label: "Updates", icon: "bell", phone: false },
    ...(segment === "RETAIL"
      ? [{ href: "/portal/fees", label: "Fees", icon: "rupee" } as const]
      : []),
    { href: "/portal/account", label: "Account", icon: "acct" },
  ];
}

export function StudentShell({
  principal,
  segment,
  badge,
  children,
}: {
  principal: Principal;
  /** Decides whether Fees exists at all. See `navFor`. */
  segment: "RETAIL" | "COLLEGE";
  /** Unread notices that are NOT FYI. See the contract for why FYI is excluded. */
  badge: number;
  children: ReactNode;
}) {
  const nav = navFor(segment);
  const tabs = nav.filter((entry) => entry.phone !== false);

  return (
    <div className="flex min-h-dvh flex-col bg-canvas lg:flex-row">
      {/* ── The sidebar, once there is room for one ───────────────────── */}
      <nav
        aria-label="Sections"
        className="hidden w-60 shrink-0 flex-col border-r border-hairline bg-surface p-4 lg:flex"
      >
        <Brand />

        <div className="mt-6 flex flex-col gap-1">
          {nav.map((entry) => (
            <StudentNavLink
              key={entry.href}
              {...entry}
              {...(entry.href === "/portal/notifications" ? { badge } : {})}
            />
          ))}
        </div>

        {/* Pushed to the foot: a portal shows your fees and your certificate,
            so every screen should say whose they are. */}
        <div className="mt-auto border-t border-hairline pt-4">
          <Identity name={principal.name} />
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ── The title bar, on a phone ──────────────────────────────── */}
        <header className="flex items-center gap-3 border-b border-hairline bg-surface px-4 py-3 lg:hidden">
          <Brand compact />
          <span className="ml-auto min-w-0 truncate text-body-sm font-medium text-ink">
            {principal.name}
          </span>
          {/* The phone's route to Updates, and the only place a badge appears
              at this width. A 44px target, because it is a real destination
              rather than an ornament beside the name. */}
          <Link
            href="/portal/notifications"
            aria-label={badge === 0 ? "Updates" : `Updates, ${badge} needing attention`}
            className="relative grid size-11 shrink-0 place-items-center rounded-control text-ink-muted hover:bg-surface-sunken hover:text-ink"
          >
            <Icon name="bell" size={22} />
            {badge === 0 ? null : (
              /* The console's own badge, same geometry and same ring — the
                 ring is what keeps a red dot legible where it overlaps the
                 icon. A raw px size on the BOX is fine; one on the type is
                 not, so the label is `text-overline`. */
              <span className="absolute top-0.5 right-0.5 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-danger px-1 text-overline text-white ring-2 ring-surface">
                {badge > 9 ? "9+" : badge}
              </span>
            )}
          </Link>
        </header>

        {/* `pb-28` clears the tab bar: content ending under a fixed bar reads
            as content that was cut off. */}
        <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 pt-6 pb-28 lg:px-10 lg:pt-10 lg:pb-16">
          {children}
        </main>
      </div>

      {/* ── The tab bar, thumb-reach, phone only ──────────────────────── */}
      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-hairline bg-surface lg:hidden"
      >
        {tabs.map((entry) => (
          <StudentTabLink key={entry.href} {...entry} />
        ))}
      </nav>
    </div>
  );
}

/**
 * The mark on its own plate.
 *
 * The artwork's wordmark is #ebedeb and measures about 1.04:1 on the canvas —
 * invisible rather than faint — so on a light sidebar the mark needs a dark
 * ground of its own. The name is set in type beside it rather than using the
 * lockup, which needs ~170px before its tagline stops being readable.
 */
function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/portal" className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-tile bg-ink">
        <Logo variant="mark" className="w-6" decorative />
      </span>
      {compact ? null : (
        <span className="min-w-0">
          <span className="block truncate text-body font-semibold text-ink">Gurukulam</span>
          <span className="block text-overline text-ink-subtle uppercase">Student</span>
        </span>
      )}
    </Link>
  );
}

function Identity({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();

  return (
    <span className="flex items-center gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-muted text-caption font-bold text-ink">
        {initials}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-body-sm font-semibold text-ink">{name}</span>
        <span className="block text-overline text-ink-subtle uppercase">Student</span>
      </span>
    </span>
  );
}
