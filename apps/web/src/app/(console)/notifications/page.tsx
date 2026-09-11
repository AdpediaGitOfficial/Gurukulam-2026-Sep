import type { Metadata, Route } from "next";
import Link from "next/link";
import type { Notification } from "@gurukulam/contracts";

import { ListFilters } from "@/components/patterns/list-filters";
import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { StatTile, StatTileGrid } from "@/components/patterns/stat-tile";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon, type IconName } from "@/components/ui/icon";
import { Pagination } from "@/components/ui/pagination";
import {
  getBell,
  listNotifications,
} from "@/features/notifications/server/notifications-service";
import { isBuiltRoute } from "@/config/navigation";
import { requirePrincipal } from "@/server/principal";
import type { SearchParams } from "@/server/list";
import { pageSummary, withParam } from "@/lib/href";
import { brandTokens, feedbackTokens } from "@/design-system/tokens";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Notifications" };

const CLASSES: Record<string, { label: string; icon: IconName; tint: string; text: string }> = {
  ACTION_REQUIRED: {
    label: "Action required",
    icon: "flag",
    tint: "bg-brand/10 text-brand",
    text: "text-brand",
  },
  ALERT: { label: "Alert", icon: "warn", tint: "bg-danger/10 text-danger", text: "text-danger" },
  FYI: { label: "FYI", icon: "bell", tint: "bg-surface-muted text-ink-subtle", text: "text-ink-subtle" },
};

/**
 * Where this notification wants to send you, if the console can get there.
 *
 * Two separate checks. Same-origin, because the target comes from data and
 * `//evil.example` is a valid protocol-relative URL. And built, because a
 * notification may name a screen that is specified but not yet written — a
 * link to it would read as a broken notification rather than a missing page.
 */
function safeHref(value: string | null): Route | undefined {
  if (value === null) return undefined;
  if (!value.startsWith("/") || value.startsWith("//")) return undefined;
  if (!isBuiltRoute(value)) return undefined;
  return value as Route;
}

function NotificationRow({ item }: { item: Notification }) {
  const meta = CLASSES[item.class] ?? CLASSES["FYI"]!;
  const href = safeHref(item.ctaHref);
  const unread = item.readAt === null;

  const body = (
    <>
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-control", meta.tint)}>
        <Icon name={meta.icon} size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="mb-0.5 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex h-[18px] items-center rounded-chip px-1.5 text-overline font-bold uppercase",
              meta.tint,
            )}
          >
            {meta.label}
          </span>
          <span className="text-caption text-ink-subtle">{item.type}</span>
        </span>
        <span className="block text-body-sm font-semibold text-ink">{item.title}</span>
        {item.body === null ? null : (
          <span className="block text-caption text-ink-subtle">{item.body}</span>
        )}
        <span className="mt-1 block text-caption text-ink-subtle">
          {new Date(item.createdAt).toLocaleString("en-IN")}
        </span>
      </span>
      {href === undefined ? null : (
        <Icon name="chev" size={16} className="-rotate-90 self-center text-ink-subtle" />
      )}
    </>
  );

  const shell = cn(
    "flex w-full gap-3 border-b border-hairline p-4 text-left last:border-b-0",
    unread ? "bg-brand/[0.04]" : "",
    href === undefined ? "" : "hover:bg-surface-sunken",
  );

  return href === undefined ? (
    <li className={shell}>{body}</li>
  ) : (
    <li>
      <Link href={href} className={shell}>
        {body}
      </Link>
    </li>
  );
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // Not module-gated: everyone signed in has a queue, and each item is already
  // scoped by the service that produced it.
  await requirePrincipal();
  const params = await searchParams;
  const [bell, page] = await Promise.all([getBell(), listNotifications(params)]);

  return (
    <PageBody>
      <PageHeader
        eyebrow="Notifications"
        title="Notifications"
        description="Grouped by situation, not by record. Eighteen overdue installments are one situation, not eighteen notifications."
      />

      <StatTileGrid>
        <StatTile
          label="Action required"
          value={formatCount(bell.actionRequired)}
          caption="Clears as the work is done"
          icon="flag"
          color={bell.actionRequired === 0 ? brandTokens.inkMuted : brandTokens.brand}
        />
        <StatTile
          label="Alerts"
          value={formatCount(bell.alerts)}
          caption="Something is wrong"
          icon="warn"
          color={bell.alerts === 0 ? brandTokens.inkMuted : feedbackTokens.danger}
        />
        <StatTile
          label="FYI"
          value={formatCount(bell.fyi)}
          caption="Never badges — read at your leisure"
          icon="bell"
          color={brandTokens.inkMuted}
        />
        <StatTile
          label="On the badge"
          value={formatCount(bell.badge)}
          caption="Action and alerts only"
          icon="apps"
          color={bell.badge === 0 ? brandTokens.inkMuted : feedbackTokens.warning}
        />
      </StatTileGrid>

      <ListFilters
        params={params}
        selects={[
          {
            name: "class",
            label: "Class",
            options: [
              { value: "", label: "All classes" },
              { value: "ACTION_REQUIRED", label: "Action required" },
              { value: "ALERT", label: "Alerts" },
              { value: "FYI", label: "FYI" },
            ],
          },
        ]}
      />

      <Card padding="none" className="overflow-hidden">
        {page.rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="Nothing needs you"
              description="This queue is meant to reach zero — an empty one is the goal, not a gap."
            />
          </div>
        ) : (
          <ul className="flex flex-col">
            {page.rows.map((item) => (
              <NotificationRow key={item.notificationId} item={item} />
            ))}
          </ul>
        )}

        <Pagination
          page={page.page}
          pageCount={page.totalPages}
          hrefForPage={(n) => withParam("/notifications", params, "page", String(n))}
          summary={pageSummary(page.page, page.pageSize, page.total)}
          className="border-t border-hairline p-6"
        />
      </Card>
    </PageBody>
  );
}
