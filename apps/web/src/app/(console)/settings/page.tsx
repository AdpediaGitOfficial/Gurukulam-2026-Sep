import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { MODULES } from "@gurukulam/contracts";

import { ModuleTabs } from "@/components/patterns/module-tabs";
import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { Card, CardHeader } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { requireModule } from "@/server/principal";
import { brandTokens, domainTokens } from "@/design-system/tokens";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Settings" };

/**
 * Set-up-once configuration, grouped rather than given rail slots of its own.
 * A tenth module needs a grouping answer, not a new slot.
 */
const SECTIONS: ReadonlyArray<{
  href: Route;
  title: string;
  description: string;
  icon: IconName;
  color: string;
  /** False while the screen does not exist yet — see `config/navigation.ts`. */
  built?: boolean;
}> = [
  {
    href: "/settings/roles",
    title: "Roles & permissions",
    description: `Module-level permissions per role, across ${MODULES.length} modules. A role plus a scope is what every query is filtered by.`,
    icon: "task",
    color: brandTokens.brand,
  },
  {
    href: "/settings/administrators",
    title: "Administrators",
    description: "Admin accounts and the regions each one is allowed to see.",
    icon: "acct",
    color: domainTokens.trainers,
  },
  {
    href: "/settings/countries",
    title: "Countries",
    description: "Operating countries, their currencies, dial codes and default timezones.",
    icon: "globe",
    color: domainTokens.localisation,
  },
  {
    href: "/settings/cities",
    title: "Cities",
    description: "Operating cities mapped to their parent country. Cities scope sub-admin access.",
    icon: "college",
    color: domainTokens.colleges,
  },
];

export default async function SettingsPage() {
  await requireModule("settings");

  return (
    <PageBody>
      <PageHeader
        eyebrow="Settings"
        title="General"
        description="Platform-wide configuration. Localisation lives here because it is set up once, not used daily."
      />
      <ModuleTabs />

      <div className="grid gap-6 sm:grid-cols-2">
        {SECTIONS.map((section) => {
          const body = (
            <>
              <span
                className="mb-4 grid size-11 place-items-center rounded-tile"
                style={{
                  color: section.color,
                  backgroundColor: "color-mix(in srgb, currentColor 12%, transparent)",
                }}
              >
                <Icon name={section.icon} size={20} />
              </span>
              <span className="block text-h3 text-ink">
                {section.title}
                {section.built === false ? (
                  <span className="ml-2 align-middle text-overline text-ink-subtle uppercase">
                    Not built yet
                  </span>
                ) : null}
              </span>
              <span className="mt-1 block text-body-sm text-ink-muted">{section.description}</span>
            </>
          );

          const shell = "rounded-card border border-hairline bg-surface p-6 transition-shadow";

          // A card for a screen that does not exist is a 404 waiting to be
          // clicked — and Next would prefetch it on hover before anyone did.
          return section.built === false ? (
            <div key={section.href} className={cn(shell, "opacity-60")}>
              {body}
            </div>
          ) : (
            <Link
              key={section.href}
              href={section.href}
              className={cn(shell, "hover:border-hairline-strong hover:shadow-raised")}
            >
              {body}
            </Link>
          );
        })}
      </div>

      <Card>
        <CardHeader
          as="h2"
          title="Scope travels with the role"
          description="How a permission becomes a filter."
        />
        <p className="text-body-sm text-ink-muted">
          A sub-admin restricted to one city gets that filter appended to every query, inside the
          service rather than at the caller — including the dashboard&rsquo;s figures, which is the
          easiest place for another region&rsquo;s data to leak precisely because it feels like just
          numbers. A college user is the same mechanism with a college scope instead of a city one.
        </p>
      </Card>
    </PageBody>
  );
}
