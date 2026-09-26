import type { Metadata } from "next";
import Link from "next/link";

import { Icon, type IconName } from "@/components/ui/icon";
import { TeachCard, TeachPage } from "@/features/teach/components/teach-page";
import { getTrainer } from "@/features/teach/server/teach-service";
import { requireTrainer } from "@/server/principal";

export const metadata: Metadata = { title: "More — Gurukulam" };

/**
 * What the phone's five tabs could not hold.
 *
 * A trainer marking a register is standing in a room holding a phone, which
 * puts a harder floor under tap targets than a desk does — five tabs is what a
 * thumb reach allows, and the rest lives behind one of them rather than being
 * unreachable. On a desk the sidebar has room for everything and this screen
 * is never needed.
 */
export default async function TrainerMorePage() {
  /* Guarded here as well as in the layout — see the dashboard. */
  await requireTrainer();

  const trainer = await getTrainer();

  const entries: { href: string; label: string; icon: IconName; description: string }[] = [
    ...(trainer.engagement === "FREELANCE"
      ? [
          {
            href: "/teach/invitations",
            label: "Invitations",
            icon: "mail" as IconName,
            description: "Batches proposed to you, to accept or turn down.",
          },
        ]
      : []),
    {
      href: "/teach/account",
      label: "Account",
      icon: "acct",
      description: "Your record, your approved courses, and signing out.",
    },
  ];

  return (
    <TeachPage eyebrow="More" title="Everything else">
      <ul className="flex flex-col gap-3">
        {entries.map((entry) => (
          <li key={entry.href}>
            <Link href={entry.href}>
              <TeachCard className="transition-colors hover:bg-surface-sunken/60">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-tile bg-teach-soft text-on-teach">
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
              </TeachCard>
            </Link>
          </li>
        ))}
      </ul>
    </TeachPage>
  );
}
