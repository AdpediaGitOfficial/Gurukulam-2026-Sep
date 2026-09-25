import type { ReactNode } from "react";
import Link from "next/link";
import type { Principal } from "@gurukulam/contracts";

import { Icon, type IconName } from "@/components/ui/icon";
import { Logo } from "@/components/ui/logo";
import { StudentNavLink, StudentTabLink } from "@/components/layout/student-nav-link";

/**
 * The student portal's frame.
 *
 * ── Why it is not the console shell ─────────────────────────────────────
 *
 * The console is a desk instrument: a fixed 80px rail, tables that scroll
 * inside their own containers, a search field across the top. A student opens
 * this on a phone between classes to answer one question — when is my next
 * session — so the shell is the other way round: a title bar and a thumb-reach
 * tab bar under 1024px, and only then a sidebar when there is room for one.
 *
 * ── Why the rail is terracotta ──────────────────────────────────────────
 *
 * `brand-guidelines.md`: the rail colour is structural, not decorative. It
 * appears on exactly one surface and never inside content, and it is what
 * makes the product recognisable at a glance. The clickable prototype gave
 * this portal an amber rail and the trainer's a green one; that was the
 * prototype exploring a per-portal identity, and the guideline won. One
 * product, one frame colour.
 */

export interface StudentNavEntry {
  href: string;
  label: string;
  icon: IconName;
}

/**
 * Three entries, not the prototype's six.
 *
 * Assignments, Fees, Certificates and Jobs are specified and not yet built. A
 * tab that navigates to a page which does not answer is worse than a missing
 * tab: the operator — here, the student — cannot tell "not built" from "I
 * tapped the wrong thing", and the console's own audit fails a control that
 * does nothing. They arrive with their screens.
 */
export const STUDENT_NAV: readonly StudentNavEntry[] = [
  { href: "/portal", label: "Home", icon: "dash" },
  { href: "/portal/learning", label: "My learning", icon: "batch" },
  { href: "/portal/account", label: "Account", icon: "acct" },
];

export function StudentShell({
  principal,
  children,
}: {
  principal: Principal;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas lg:flex-row">
      {/* ── The sidebar, only when there is room for one ──────────────── */}
      <nav
        aria-label="Sections"
        className="hidden w-64 shrink-0 flex-col gap-1 bg-rail p-4 lg:flex"
      >
        <Link href="/portal" className="mb-6 flex items-center gap-3 px-2 py-1">
          <Logo variant="mark" className="w-10" decorative />
          <span className="min-w-0">
            <span className="block truncate text-body font-semibold text-white">Gurukulam</span>
            <span className="block text-caption text-white/70">Student portal</span>
          </span>
        </Link>
        {STUDENT_NAV.map((entry) => (
          <StudentNavLink key={entry.href} {...entry} />
        ))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ── The title bar, on a phone ──────────────────────────────────
            Carries who you are, because a portal that shows your fees and
            your certificate should say whose they are on every screen. */}
        <header className="flex items-center gap-3 bg-rail px-4 py-3 lg:hidden">
          <Logo variant="mark" className="w-9 shrink-0" decorative />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body font-semibold text-white">
              {principal.name}
            </span>
            <span className="block text-caption text-white/70">Student portal</span>
          </span>
        </header>

        {/* `pb-24` on a phone clears the tab bar: content that ends under a
            fixed bar reads as content that was cut off. */}
        <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-24 lg:px-8 lg:pb-16">
          {children}
        </main>
      </div>

      {/* ── The tab bar, thumb-reach, phone only ───────────────────────── */}
      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-hairline bg-surface lg:hidden"
      >
        {STUDENT_NAV.map((entry) => (
          <StudentTabLink key={entry.href} {...entry} />
        ))}
      </nav>
    </div>
  );
}

/** The signed-in identity, for the sidebar's foot. Rendered by the layout. */
export function StudentIdentity({ principal }: { principal: Principal }) {
  return (
    <span className="flex items-center gap-2 text-caption text-white/70">
      <Icon name="acct" size={16} />
      <span className="truncate">{principal.name}</span>
    </span>
  );
}
