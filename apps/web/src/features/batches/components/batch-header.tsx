import Link from "next/link";
import type { BatchDetail } from "@gurukulam/contracts";

import { PageHeader } from "@/components/patterns/page-header";
import { SegmentTag } from "@/components/patterns/segment-tag";
import { buttonVariants } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { StatusPill } from "@/components/ui/status-pill";
import { Tabs } from "@/components/ui/tabs";

/**
 * The identity of a batch, shared by its three views.
 *
 * A server component rather than a layout: the tabs carry counts, and a layout
 * cannot see the data its children fetched. Each page passes what it knows.
 */
export function BatchHeader({
  batch,
  counts,
}: {
  batch: BatchDetail;
  counts: { sessions: number; students: number; recordings: number };
}) {
  const base = `/batches/${batch.batchId}`;

  return (
    <>
      <PageHeader
        eyebrow="Batches"
        title={batch.name}
        description={[
          batch.batchCode,
          batch.courseName,
          batch.cityName,
          batch.mode.toLowerCase(),
        ]
          .filter(Boolean)
          .join(" · ")}
        breadcrumbs={[{ label: "Batches", href: "/batches" }, { label: batch.name }]}
        action={
          <Link href={`${base}/edit`} className={buttonVariants({ variant: "secondary" })}>
            Edit batch
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <SegmentTag segment={batch.segment} />
        <StatusPill
          intent={
            batch.status === "COMPLETED"
              ? "success"
              : batch.status === "CANCELLED"
                ? "neutral"
                : "info"
          }
        >
          {batch.status.replace(/_/g, " ").toLowerCase()}
        </StatusPill>
        {batch.collegeName === null || batch.collegeName === undefined ? null : (
          <Link
            href={`/colleges?q=${encodeURIComponent(batch.collegeName)}`}
            className="text-body-sm text-gold underline-offset-4 hover:underline"
          >
            {batch.collegeName}
          </Link>
        )}
        {/* The CONFIRMED trainer only. A proposal is not delivery. */}
        <Chip>
          {batch.primaryTrainerName === null || batch.primaryTrainerName === undefined
            ? "No trainer confirmed"
            : batch.primaryTrainerName}
        </Chip>
        {batch.venue === null ? null : <Chip>{batch.venue}</Chip>}
      </div>

      <Tabs
        items={[
          { href: base, label: "Sessions", count: counts.sessions },
          { href: `${base}/roster`, label: "Roster", count: counts.students },
          { href: `${base}/recordings`, label: "Recordings", count: counts.recordings },
        ]}
      />
    </>
  );
}
