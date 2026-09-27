import type { Metadata } from "next";
import Link from "next/link";

import { Icon, type IconName } from "@/components/ui/icon";
import { CampusCard, CampusPage } from "@/features/campus/components/campus-page";
import { requireCollegeUser } from "@/server/principal";

export const metadata: Metadata = { title: "More — Gurukulam" };

/**
 * What the phone's five tabs could not hold.
 *
 * Five is what a thumb reach allows, so Billing and Account live behind one of
 * them rather than being unreachable. On a desk the sidebar has room for
 * everything and this screen is never needed — which is also why a bursar, who
 * reconciles sitting down, loses nothing by Billing being here.
 */
export default async function CampusMorePage() {
  /* Guarded here as well as in the layout — they render concurrently. */
  await requireCollegeUser();

  const entries: { href: string; label: string; icon: IconName; description: string }[] = [
    {
      href: "/campus/billing",
      label: "Billing",
      icon: "rupee",
      description: "Your contracts, what has been paid, and what is due next.",
    },
    {
      href: "/campus/account",
      label: "Account",
      icon: "acct",
      description: "Your login, your institution's record, and signing out.",
    },
  ];

  return (
    <CampusPage eyebrow="More" title="Everything else">
      <ul className="flex flex-col gap-3">
        {entries.map((entry) => (
          <li key={entry.href}>
            <Link href={entry.href}>
              <CampusCard className="transition-colors hover:bg-surface-sunken/60">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-tile bg-campus-soft text-on-campus">
                    <Icon name={entry.icon} size={20} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-body font-semibold text-ink">{entry.label}</span>
                    <span className="block text-body-sm break-words text-ink-muted">
                      {entry.description}
                    </span>
                  </span>
                  <Icon name="chev" size={18} className="ml-auto -rotate-90 shrink-0 text-ink-subtle" />
                </span>
              </CampusCard>
            </Link>
          </li>
        ))}
      </ul>
    </CampusPage>
  );
}
