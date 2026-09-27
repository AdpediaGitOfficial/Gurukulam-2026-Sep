import type { ReactNode } from "react";
import Link from "next/link";
import type { MeCollege } from "@gurukulam/contracts";

import { Logo } from "@/components/ui/logo";
import { Icon, type IconName } from "@/components/ui/icon";
import { CampusNavLink, CampusTabLink } from "@/components/layout/campus-nav-link";

/**
 * The college portal's frame.
 *
 * ── Why the rail is indigo, and the text on it dark ────────────────────
 *
 * Measured to sit where the trainer's green sits: dark `#10162E` on this indigo
 * is 5.17:1 against the green's 5.37:1, and white on it fails at 3.45:1 exactly
 * as white on the green does. So the third portal joins the family rather than
 * inventing a fourth rule — the console's rail is dark with light text, and
 * every portal rail is light with dark text, spending one colour on the active
 * entry.
 *
 * Indigo rather than the console's blue, because `--color-brand` IS the
 * console: a college rail in that blue would read as the operator's product
 * wearing the wrong navigation.
 *
 * ── Why the nav reads as the engagement ────────────────────────────────
 *
 * A college opens this to answer one of five questions: what have we asked for,
 * who have we sent, when are they taught, what have they earned, and what do we
 * owe. The order follows that sentence rather than our internal delivery chain.
 */

export interface CampusNavEntry {
  href: string;
  label: string;
  icon: IconName;
  short?: string;
  /** Under More on a phone. Five tabs is what a thumb reach allows. */
  phone?: boolean;
}

const NAV: readonly CampusNavEntry[] = [
  { href: "/campus", label: "Overview", icon: "dash" },
  { href: "/campus/requirements", label: "Requirements", icon: "task", short: "Asks" },
  { href: "/campus/students", label: "Students", icon: "users" },
  { href: "/campus/schedule", label: "Schedule", icon: "cal" },
  { href: "/campus/certificates", label: "Certificates", icon: "seal", short: "Certs" },
  // Billing is the institution's own money (invariant 3: in this segment the
  // college is the payer), so it is a first-class entry rather than something
  // behind an account menu — but it sits behind More on a phone, because a
  // bursar reconciles at a desk.
  { href: "/campus/billing", label: "Billing", icon: "rupee", phone: false },
  { href: "/campus/account", label: "Account", icon: "acct", phone: false },
];

export function CampusShell({
  college,
  /** Badged on Requirements: raised by them, not yet answered by us. */
  withUs,
  children,
}: {
  college: MeCollege;
  withUs: number;
  children: ReactNode;
}) {
  const tabs = NAV.filter((entry) => entry.phone !== false);

  return (
    <div className="flex min-h-dvh flex-col bg-canvas lg:flex-row">
      <nav
        aria-label="Sections"
        className="hidden w-60 shrink-0 flex-col border-r border-hairline bg-surface p-4 lg:flex"
      >
        <Brand />

        <div className="mt-6 flex flex-col gap-1">
          {NAV.map((entry) => (
            <CampusNavLink
              key={entry.href}
              {...entry}
              {...(entry.href === "/campus/requirements" ? { badge: withUs } : {})}
            />
          ))}
        </div>

        <div className="mt-auto border-t border-hairline pt-4">
          <Identity college={college} />
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-hairline bg-surface px-4 py-3 lg:hidden">
          <Brand compact />
          <span className="ml-auto min-w-0 truncate text-body-sm font-medium text-ink">
            {college.name}
          </span>
          <Link
            href="/campus/account"
            aria-label="Account"
            className="grid size-11 shrink-0 place-items-center rounded-control text-ink-muted hover:bg-campus-soft hover:text-on-campus"
          >
            <Icon name="acct" size={22} />
          </Link>
        </header>

        <main
          id="main"
          className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28 lg:px-10 lg:pt-10 lg:pb-16"
        >
          {children}
        </main>
      </div>

      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-hairline bg-surface lg:hidden"
      >
        {tabs.map((entry) => (
          <CampusTabLink key={entry.href} {...entry} />
        ))}
        <CampusTabLink href="/campus/more" label="More" icon="menu" />
      </nav>
    </div>
  );
}

/** The mark on its own dark plate — amber on indigo is no mark either. */
function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/campus" className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-tile bg-ink">
        <Logo variant="mark" className="w-6" decorative />
      </span>
      {compact ? null : (
        <span className="min-w-0">
          <span className="block truncate text-body font-semibold text-ink">Gurukulam</span>
          <span className="block text-overline text-ink-subtle uppercase">College</span>
        </span>
      )}
    </Link>
  );
}

/**
 * Who is signed in, and for which institution.
 *
 * Both, because they are different facts and a POC needs each: their own name
 * to know which account they are using, and the college's to know they are in
 * the right institution's portal. Several people at one college hold separate
 * logins, and the login identity is derived from the college code rather than
 * from their own address — so "which account am I?" is a real question here in
 * a way it is not on a trainer's screen.
 */
function Identity({ college }: { college: MeCollege }) {
  const initials = college.name
    .split(/\s+/)
    .filter((part) => /^[A-Za-z]/.test(part))
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();

  return (
    <span className="flex items-center gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-campus-soft text-caption font-bold text-on-campus">
        {initials}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-body-sm font-semibold text-ink">{college.name}</span>
        <span className="block truncate text-overline text-ink-subtle uppercase">
          {college.user.name}
        </span>
      </span>
    </span>
  );
}
