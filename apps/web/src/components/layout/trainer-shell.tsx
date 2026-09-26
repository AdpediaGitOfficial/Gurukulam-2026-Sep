import type { ReactNode } from "react";
import Link from "next/link";
import type { MeTrainer } from "@gurukulam/contracts";

import { Logo } from "@/components/ui/logo";
import { Icon, type IconName } from "@/components/ui/icon";
import { TrainerNavLink, TrainerTabLink } from "@/components/layout/trainer-nav-link";

/**
 * The trainer portal's frame.
 *
 * ── Why the rail is green, and why the text on it is dark ──────────────
 *
 * `#34A853`, as asked. White on it measures 3.05:1, which fails AA for a 14px
 * nav label; the deep green-black `#0D2415` is 5.37:1 and reads more
 * intentional on a green ground than neutral ink. That is not a workaround —
 * it makes the two portals a family: the admin's rail is dark with light text,
 * and both portal rails are light with dark text.
 *
 * ── Why the nav reads as the day ───────────────────────────────────────
 *
 * A trainer opens this to answer a question, not to survey an estate. What is
 * happening now, what is coming, who it is for.
 */

export interface TrainerNavEntry {
  href: string;
  label: string;
  icon: IconName;
  short?: string;
  /** Under More on a phone. Five tabs is the limit a thumb reach allows. */
  phone?: boolean;
}

/**
 * The entries, and the one that depends on the reader.
 *
 * ── Why Invitations is absent for an in-house trainer ──────────────────
 *
 * They are staff, not a counterparty: their assignment is created CONFIRMED
 * the moment they are allocated, so there is never anything to accept. Absent
 * rather than empty, for the same reason Fees is absent for a college student
 * — an empty Invitations screen reads as "nothing has been offered yet", when
 * the truth is that nothing ever will be.
 *
 * ── Why Batches and Sessions are both here ─────────────────────────────
 *
 * They answer different questions and the same rows serve both. "How is this
 * cohort going" is a batch question; "what still needs a register" cuts across
 * batches. Folding either into the other makes one of them a filter away.
 */
function navFor(engagement: MeTrainer["engagement"]): readonly TrainerNavEntry[] {
  return [
    { href: "/teach", label: "Dashboard", icon: "dash" },
    // `users` rather than `batch`: the batch glyph and the calendar glyph are
    // the same artwork, and two adjacent entries carrying one icon is an icon
    // doing no work. A cohort is a group of people; a session is a day.
    { href: "/teach/batches", label: "Batches", icon: "users" },
    { href: "/teach/sessions", label: "Sessions", icon: "cal" },
    { href: "/teach/availability", label: "Availability", icon: "clock", short: "Diary" },
    ...(engagement === "FREELANCE"
      ? [{ href: "/teach/invitations", label: "Invitations", icon: "mail", phone: false } as const]
      : []),
    { href: "/teach/account", label: "Account", icon: "acct", phone: false },
  ];
}

export function TrainerShell({
  trainer,
  invitations,
  children,
}: {
  trainer: MeTrainer;
  /** Badged on Invitations. Always 0 for an in-house trainer. */
  invitations: number;
  children: ReactNode;
}) {
  const nav = navFor(trainer.engagement);
  const tabs = nav.filter((entry) => entry.phone !== false);

  return (
    <div className="flex min-h-dvh flex-col bg-canvas lg:flex-row">
      <nav
        aria-label="Sections"
        className="hidden w-60 shrink-0 flex-col border-r border-hairline bg-surface p-4 lg:flex"
      >
        <Brand />

        <div className="mt-6 flex flex-col gap-1">
          {nav.map((entry) => (
            <TrainerNavLink
              key={entry.href}
              {...entry}
              {...(entry.href === "/teach/invitations" ? { badge: invitations } : {})}
            />
          ))}
        </div>

        <div className="mt-auto border-t border-hairline pt-4">
          <Identity trainer={trainer} />
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-hairline bg-surface px-4 py-3 lg:hidden">
          <Brand compact />
          <span className="ml-auto min-w-0 truncate text-body-sm font-medium text-ink">
            {trainer.name}
          </span>
          <Link
            href="/teach/account"
            aria-label="Account"
            className="grid size-11 shrink-0 place-items-center rounded-control text-ink-muted hover:bg-teach-soft hover:text-on-teach"
          >
            <Icon name="acct" size={22} />
          </Link>
        </header>

        {/* Suspension is said once, at the top of every screen, rather than
            discovered one refused button at a time. */}
        {trainer.suspended ? <SuspendedBanner reason={trainer.suspendedReason} /> : null}

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
          <TrainerTabLink key={entry.href} {...entry} />
        ))}
        {/* More, so nothing is unreachable on a phone. Invitations and Account
            live behind it; five tabs is what a thumb reach allows. */}
        <TrainerTabLink href="/teach/more" label="More" icon="menu" />
      </nav>
    </div>
  );
}

/**
 * Read-only, said out loud.
 *
 * A suspended trainer keeps their confirmed batches — pulling somebody off
 * live delivery as a side effect of a status change would strand the cohort —
 * so they sign in and read. Every write refuses, and a portal that refuses
 * silently is one somebody reports as broken rather than one they understand.
 */
function SuspendedBanner({ reason }: { reason: string | null }) {
  return (
    <div className="border-b border-warning/30 bg-warning/10 px-4 py-3 lg:px-10">
      <p className="mx-auto flex max-w-5xl items-start gap-2 text-body-sm text-warning-strong">
        <Icon name="warn" size={18} className="mt-0.5 shrink-0" />
        <span>
          <span className="font-semibold">Your account is suspended.</span> You can see your
          schedule and your cohorts, and cannot mark attendance, set work or answer invitations.
          {reason === null ? "" : ` ${reason}`} Speak to the office.
        </span>
      </p>
    </div>
  );
}

/**
 * The mark on its own plate.
 *
 * Amber on green is no mark, so it keeps the dark tile the student rail gave
 * it — the third of the inversions a light rail needs.
 */
function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/teach" className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-tile bg-ink">
        <Logo variant="mark" className="w-6" decorative />
      </span>
      {compact ? null : (
        <span className="min-w-0">
          <span className="block truncate text-body font-semibold text-ink">Gurukulam</span>
          <span className="block text-overline text-ink-subtle uppercase">Trainer</span>
        </span>
      )}
    </Link>
  );
}

function Identity({ trainer }: { trainer: MeTrainer }) {
  const initials = trainer.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();

  return (
    <span className="flex items-center gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-teach-soft text-caption font-bold text-on-teach">
        {initials}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-body-sm font-semibold text-ink">{trainer.name}</span>
        <span className="block text-overline text-ink-subtle uppercase">
          {trainer.engagement === "IN_HOUSE" ? "In-house" : "Freelance"}
        </span>
      </span>
    </span>
  );
}
