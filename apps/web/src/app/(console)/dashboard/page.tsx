import type { Metadata, Route } from "next";
import { formatRupees, formatRupeesShort, fromWire, type Dashboard } from "@gurukulam/contracts";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody, PageSection } from "@/components/patterns/page-section";
import { StatTile, StatTileGrid } from "@/components/patterns/stat-tile";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { CollectionsTrend } from "@/features/dashboard/components/collections-trend";
import { SegmentSplit } from "@/features/dashboard/components/segment-split";
import { AttentionQueue, type QueueRow } from "@/features/dashboard/components/attention-queue";
import { DistributionBand, type BandSlice } from "@/features/dashboard/components/distribution-band";
import { RatePair, type Rate } from "@/features/dashboard/components/rate-pair";
import { getDashboard } from "@/features/dashboard/server/dashboard-service";
import {
  brandTokens,
  deliveryRamp,
  domainTokens,
  feedbackTokens,
  utilisationRamp,
} from "@/design-system/tokens";
import { formatCount } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };

/** Rows a dashboard card shows before it defers to the list behind it. */
const CARD_ROWS = 5;

type TopCourse = Dashboard["topCourses"][number];
type TrainerLoad = Dashboard["trainerLoad"][number];

/**
 * The four queues that should reach zero.
 *
 * Rendered in alert colours and linked into the module that clears them,
 * because a number an operator cannot act on is decoration. Each href carries
 * the filter that isolates exactly the rows counted here — landing on an
 * unfiltered list would make the operator find them again by hand.
 */
const ACTION_TILES = [
  {
    key: "unallocatedStudents",
    label: "Unallocated students",
    caption: "Enrolled, not yet in a batch",
    icon: "users",
    color: feedbackTokens.danger,
    href: "/students/unallocated",
  },
  {
    key: "overdueInstallments",
    label: "Overdue installments",
    caption: "Past their due date",
    icon: "warn",
    color: feedbackTokens.danger,
    href: "/fee-ledger?status=overdue",
  },
  {
    key: "certificatesAwaitingApproval",
    label: "Certificates to approve",
    caption: "Waiting on a decision",
    icon: "seal",
    color: feedbackTokens.warning,
    /* The queue is certificate-list ROWS awaiting a decision, and those live
       on the submission review screen. It used to point at the certificate
       register with `status=pending` — not a certificate status at all, so the
       filter was refused and the page 500-ed before the error boundary
       existed. */
    href: "/colleges/submissions",
  },
  {
    key: "sessionsMissingRecordings",
    label: "Missing recordings",
    caption: "Completed sessions with no upload",
    icon: "play",
    color: feedbackTokens.warning,
    href: "/batches?recordings=missing",
  },
] as const;

/**
 * The four delivery buckets, in the order they are drawn.
 *
 * Label, colour and destination live together because they describe one thing;
 * splitting them across three files is how a segment comes to be coloured for
 * one bucket and linked to another. The order is the band's order — these are
 * read left to right as a single quantity.
 */
const DELIVERY_BUCKETS = [
  {
    bucket: "NOT_SCHEDULED",
    label: "Not scheduled",
    title: "No session has been timetabled against this course",
    href: "/courses?delivery=NOT_SCHEDULED",
  },
  {
    bucket: "NOT_STARTED",
    label: "Not started",
    title: "Timetabled, but nothing delivered yet",
    href: "/courses?delivery=NOT_STARTED",
  },
  {
    bucket: "IN_FLIGHT",
    label: "In flight",
    title: "Part-delivered",
    href: "/courses?delivery=IN_FLIGHT",
  },
  {
    bucket: "COMPLETE",
    label: "Complete",
    title: "Every scheduled session delivered",
    href: "/courses?delivery=COMPLETE",
  },
] as const;

/**
 * Utilisation. Not a ramp — BOTH ends are the problem.
 *
 * An idle trainer is capacity nobody is selling; a stretched one breaks the
 * week when a single session moves. The middle is the goal, which is why the
 * colour runs amber, green, green, red rather than in one direction.
 */
const UTILISATION_BUCKETS = [
  {
    bucket: "BENCH",
    label: "On the bench",
    title: "Active, carrying no live batch at all",
    href: "/trainers?utilisation=BENCH",
  },
  {
    bucket: "LIGHT",
    label: "Light · 1–2",
    title: "One or two live batches",
    href: "/trainers?utilisation=LIGHT",
  },
  {
    bucket: "BUSY",
    label: "Busy · 3–4",
    title: "Three or four live batches",
    href: "/trainers?utilisation=BUSY",
  },
  {
    bucket: "STRETCHED",
    label: "Stretched · 5+",
    title: "At a load where one cancellation cascades",
    href: "/trainers?utilisation=STRETCHED",
  },
] as const;

const COURSE_COLUMNS: Column<TopCourse>[] = [
  {
    id: "course",
    header: "Course",
    cell: (row) => (
      <div className="flex flex-col">
        <span className="text-body text-ink">{row.name}</span>
        <span className="font-mono text-caption text-ink-muted">{row.courseCode}</span>
      </div>
    ),
  },
  {
    id: "enrolled",
    header: "Enrolled",
    align: "end",
    cell: (row) => (
      <div className="flex flex-col items-end">
        <span className="text-body text-ink tabular-nums">{formatCount(row.enrolled.total)}</span>
        <span className="whitespace-nowrap text-caption text-ink-muted tabular-nums">
          {formatCount(row.enrolled.retail)} retail · {formatCount(row.enrolled.college)} college
        </span>
      </div>
    ),
  },
  {
    id: "batches",
    header: "Active batches",
    align: "end",
    cell: (row) => <span className="tabular-nums">{formatCount(row.activeBatches)}</span>,
  },
  {
    id: "revenue",
    header: "Revenue",
    align: "end",
    cell: (row) => (
      <span className="tabular-nums">{formatRupees(fromWire(row.revenueMinor), { paise: false })}</span>
    ),
  },
];

const TRAINER_COLUMNS: Column<TrainerLoad>[] = [
  {
    id: "trainer",
    header: "Trainer",
    cell: (row) => (
      <div className="flex flex-col">
        <span className="text-body text-ink">{row.name}</span>
        <span className="font-mono text-caption text-ink-muted">{row.trainerCode}</span>
      </div>
    ),
  },
  {
    id: "batches",
    header: "Confirmed",
    align: "end",
    cell: (row) => <span className="tabular-nums">{formatCount(row.confirmedBatches)}</span>,
  },
  {
    id: "upcoming",
    header: "Upcoming sessions",
    align: "end",
    cell: (row) => <span className="tabular-nums">{formatCount(row.sessionsUpcoming)}</span>,
  },
  {
    id: "courses",
    header: "Approved courses",
    align: "end",
    cell: (row) => <span className="tabular-nums">{formatCount(row.approvedCourses)}</span>,
  },
];

export default async function DashboardPage() {
  const dashboard = await getDashboard();
  /* The API ranks every course and every trainer and returns ten. A card is a
     pointer rather than a report, so it shows five and says "5 of 1,217" —
     the denominator is what makes a short list honest. */
  const topCourses = dashboard.topCourses.slice(0, CARD_ROWS);
  const trainerLoad = dashboard.trainerLoad.slice(0, CARD_ROWS);
  const { headline, actions, collections, trend, delivery, portfolio, capacity, scope } = dashboard;

  // The API returns counts keyed by bucket; the vocabulary above supplies the
  // label, the colour and the destination. Zipped here rather than in the
  // component so the band stays a dumb renderer of whatever it is handed.
  const countOf = <T extends string>(
    slices: ReadonlyArray<{ bucket: T; count: number }>,
    bucket: T,
  ): number => slices.find((s) => s.bucket === bucket)?.count ?? 0;

  const deliverySlices: BandSlice[] = DELIVERY_BUCKETS.map((b, index) => ({
    key: b.bucket,
    label: b.label,
    title: b.title,
    count: countOf(portfolio.delivery, b.bucket),
    color: deliveryRamp[index] ?? deliveryRamp[0],
    href: b.href as Route,
  }));

  const utilisationSlices: BandSlice[] = UTILISATION_BUCKETS.map((b, index) => ({
    key: b.bucket,
    label: b.label,
    title: b.title,
    count: countOf(capacity.utilisation, b.bucket),
    color: utilisationRamp[index] ?? utilisationRamp[0],
    href: b.href as Route,
  }));

  /* Completion and drop-out are independent: a student can finish, and a
     student can walk away, and neither implies the other — so both are rates
     over the same roster rather than two halves of one pie. */
  const outcomeRates: Rate[] = [
    {
      label: "Completion",
      count: portfolio.completedEnrolments,
      of: portfolio.enrolments,
      ofNoun: "enrolments",
      tone: "good",
      emptyHint: "Nobody on a roster yet",
    },
    {
      label: "Drop-out",
      count: portfolio.exitedEnrolments,
      of: portfolio.enrolments,
      ofNoun: "enrolments",
      tone: "bad",
      emptyHint: "Nobody on a roster yet",
    },
  ];

  const adherenceRates: Rate[] = [
    {
      label: "Schedule adherence",
      count: capacity.sessionsOnPlan,
      of: capacity.sessionsDecided,
      ofNoun: "sessions",
      tone: "good",
      emptyHint: "No session decided in 30 days",
    },
    {
      label: "Carrying delivery",
      count: capacity.carryingDelivery,
      of: capacity.activeTrainers,
      ofNoun: "trainers",
      tone: "plain",
      emptyHint: "No active trainers",
    },
  ];

  /* Ordered by how much it hurts to leave alone, not by size. A batch that is
     quietly not happening outranks a catalogue-hygiene problem however many
     rows the second one has. */
  const portfolioQueue: QueueRow[] = [
    {
      key: "stalled",
      count: portfolio.stalledBatches,
      label: "Batches past their start date with no session delivered",
      tone: "danger",
      href: "/batches?attention=STALLED" as Route,
    },
    {
      key: "noEnrolment",
      count: portfolio.coursesWithoutEnrolment,
      label: "Courses with live batches and nobody enrolled",
      tone: "warning",
      href: "/courses?attention=NO_ENROLMENT" as Route,
    },
    {
      key: "overCapacity",
      count: portfolio.batchesOverCapacity,
      label: "Batches over their capacity",
      tone: "warning",
      href: "/batches?attention=OVER_CAPACITY" as Route,
    },
    {
      key: "noTopics",
      count: portfolio.coursesWithoutTopics,
      label: "Courses with no topics defined",
      tone: "warning",
      href: "/courses?attention=NO_TOPICS" as Route,
    },
  ];

  const capacityQueue: QueueRow[] = [
    {
      key: "unstaffed",
      count: capacity.unstaffedBatchesSoon,
      label: "Batches starting in 14 days with no trainer confirmed",
      tone: "danger",
      href: "/batches?attention=UNSTAFFED_SOON" as Route,
    },
    {
      key: "doubleBooked",
      count: capacity.doubleBookedTrainers,
      label: "Trainers double-booked on the same morning",
      tone: "danger",
      href: "/trainers?attention=DOUBLE_BOOKED" as Route,
    },
    {
      key: "staleProposals",
      count: capacity.staleProposals,
      label: "Proposals waiting on a trainer for over 7 days",
      tone: "warning",
      href: "/batches?status=SCHEDULED" as Route,
    },
    {
      key: "noCourses",
      count: capacity.trainersWithoutCourses,
      label: "Trainers approved to deliver nothing",
      tone: "warning",
      href: "/trainers?attention=NO_COURSES" as Route,
    },
  ];

  const thisMonth = fromWire(trend.collectedThisMonth.total);
  const lastMonth = fromWire(trend.collectedLastMonth.total);

  /*
   * Month-over-month, as a percentage of the month it is compared against.
   *
   * Computed in MINOR UNITS through bigint arithmetic — a percentage of money
   * is still money arithmetic, and `Number(paise)` passes 2^53 at about ₹9
   * crore, which these figures reach.
   *
   * The two cases worth naming: a previous month of zero has no percentage to
   * give (everything is an infinite rise from nothing), so it says what
   * happened instead; and DOWN is not automatically bad here — a fall in
   * collections is, which is why the direction is computed from the sign and
   * the colour is left to say only that.
   */
  const delta = (current: bigint, previous: bigint): { text: string; direction: "up" | "down" | "flat" } => {
    if (previous === 0n) {
      if (current === 0n) return { text: "no change", direction: "flat" };
      return { text: current > 0n ? "first this month" : "net negative", direction: current > 0n ? "up" : "down" };
    }
    const change = current - previous;
    if (change === 0n) return { text: "no change", direction: "flat" };
    const absPrevious = previous < 0n ? -previous : previous;
    const percent = Number((change * 1000n) / absPrevious) / 10;
    const rounded = Math.abs(percent) >= 10 ? Math.round(percent) : Math.round(percent * 10) / 10;
    return {
      text: `${rounded > 0 ? "+" : ""}${rounded}%`,
      direction: change > 0n ? "up" : "down",
    };
  };

  const collectedDelta = delta(thisMonth, lastMonth);

  const countDelta = (current: number, previous: number): { text: string; direction: "up" | "down" | "flat" } => {
    const change = current - previous;
    if (change === 0) return { text: "no change", direction: "flat" };
    // A count moves by whole people, so it reads better as a count than a
    // percentage: "+12" is what somebody would say out loud.
    return { text: `${change > 0 ? "+" : ""}${change}`, direction: change > 0 ? "up" : "down" };
  };

  const enrolmentDelta = countDelta(
    trend.enrolmentsThisMonth.total,
    trend.enrolmentsLastMonth.total,
  );

  return (
    <PageBody>
      <PageHeader
        title="Dashboard"
        description={`Retail and college, side by side. ${scope.label}.`}
      />

      <PageSection title="Headline" hideTitle>
        <StatTileGrid>
          <StatTile
            label="Students"
            value={formatCount(headline.students.total)}
            caption={`${formatCount(headline.students.retail)} retail · ${formatCount(headline.students.college)} college`}
            icon="users"
            color={domainTokens.students}
            href="/students"
          />
          <StatTile
            label="Trainers"
            value={formatCount(headline.trainers)}
            caption="Active instructors"
            icon="trainer"
            color={domainTokens.trainers}
            href="/trainers"
          />
          <StatTile
            label="Colleges"
            value={formatCount(headline.colleges)}
            caption="B2B partners"
            icon="college"
            color={domainTokens.colleges}
            href="/colleges"
          />
          <StatTile
            label="Question bank"
            value={formatCount(headline.questionBank)}
            caption="Questions available"
            icon="brain"
            color={domainTokens["question-bank"]}
            href="/courses/question-bank"
          />
        </StatTileGrid>
      </PageSection>

      {/* This month against last, and the twelve months behind them. Kept out
          of the headline row above: those are STANDING counts and these are a
          period, and mixing the two invites reading "206 students" as a
          monthly figure. */}
      <PageSection title="This month" hideTitle>
        <StatTileGrid>
          <StatTile
            label="Collected this month"
            value={formatRupeesShort(thisMonth)}
            caption={`Last month ${formatRupeesShort(lastMonth)}`}
            delta={collectedDelta}
            icon="rupee"
            color={brandTokens.gold}
            href="/fee-ledger"
          />
          <StatTile
            label="Enrolled this month"
            value={formatCount(trend.enrolmentsThisMonth.total)}
            caption={`${formatCount(trend.enrolmentsThisMonth.retail)} retail · ${formatCount(trend.enrolmentsThisMonth.college)} college`}
            delta={enrolmentDelta}
            icon="users"
            color={domainTokens.students}
            href="/students"
          />
        </StatTileGrid>
      </PageSection>

      <PageSection title="Collections over time" hideTitle>
        <CollectionsTrend months={trend.months} />
      </PageSection>

      <PageSection
        title="Needs attention"
        description="Each of these is a queue that should reach zero."
      >
        <StatTileGrid>
          {ACTION_TILES.map((tile) => (
            <StatTile
              key={tile.key}
              label={tile.label}
              value={formatCount(actions[tile.key])}
              caption={tile.caption}
              icon={tile.icon}
              // A queue at zero is not an alert. Colouring it red anyway is how
              // an operator learns to stop reading the colour.
              color={actions[tile.key] === 0 ? brandTokens.inkMuted : tile.color}
              href={tile.href as Route}
            />
          ))}
        </StatTileGrid>
      </PageSection>

      {/* Two cards, one row, equal width and equal height.

          They are a matched pair on purpose: the same blocks in the same
          order — a band, a queue, a ranked table — so an operator reads the
          second the way they just read the first. `items-stretch` is what
          keeps them the same height when one has fewer rows than the other;
          without it the shorter card floats and the row stops reading as a
          pair. */}
      <PageSection
        title="Portfolio and capacity"
        description="The whole catalogue and the whole bench, described rather than sampled."
      >
        <div className="grid items-stretch gap-8 xl:grid-cols-2">
          <Card className="flex h-full min-w-0 flex-col gap-7">
            <CardHeader
              className="pb-0"
              as="h2"
              title="Course portfolio"
              description={`${formatCount(portfolio.totalCourses)} courses · ${formatCount(portfolio.withLiveDelivery)} with live delivery`}
            />

            <RatePair rates={outcomeRates} />

            <DistributionBand
              caption={`Delivery progress, all ${formatCount(portfolio.totalCourses)}`}
              total={portfolio.totalCourses}
              slices={deliverySlices}
            />

            <AttentionQueue caption="Needs a decision" rows={portfolioQueue} />

            <section className="mt-auto flex min-w-0 flex-col gap-3">
              <p className="text-caption font-semibold uppercase tracking-wide text-ink-subtle">
                Largest by enrolment —{" "}
                <span className="normal-case tracking-normal">
                  {formatCount(topCourses.length)} of{" "}
                  {formatCount(portfolio.totalCourses)}
                </span>
              </p>
              <div className="-mx-6 -mb-6 overflow-hidden rounded-b-card">
                <DataTable
                  columns={COURSE_COLUMNS}
                  rows={topCourses}
                  getRowId={(row) => row.courseId}
                  caption="Courses by enrolment and revenue, ranked across the catalogue"
                  empty={
                    <EmptyState
                      title="No courses yet"
                      description="Course performance appears once students are enrolled."
                    />
                  }
                />
              </div>
            </section>
          </Card>

          <Card className="flex h-full min-w-0 flex-col gap-7">
            <CardHeader
              className="pb-0"
              as="h2"
              title="Trainer capacity"
              description={`${formatCount(capacity.activeTrainers)} active · ${formatCount(capacity.carryingDelivery)} carrying delivery`}
            />

            <RatePair rates={adherenceRates} />

            <DistributionBand
              caption={`Utilisation, all ${formatCount(capacity.activeTrainers)}`}
              total={capacity.activeTrainers}
              slices={utilisationSlices}
            />

            <AttentionQueue caption="Needs a decision" rows={capacityQueue} />

            <section className="mt-auto flex min-w-0 flex-col gap-3">
              <p className="text-caption font-semibold uppercase tracking-wide text-ink-subtle">
                Most loaded —{" "}
                <span className="normal-case tracking-normal">
                  {formatCount(trainerLoad.length)} of{" "}
                  {formatCount(capacity.activeTrainers)}, by sessions ahead
                </span>
              </p>
              <div className="-mx-6 -mb-6 overflow-hidden rounded-b-card">
                <DataTable
                  columns={TRAINER_COLUMNS}
                  rows={trainerLoad}
                  getRowId={(row) => row.trainerId}
                  caption="Trainers by upcoming sessions, ranked across the bench"
                  empty={
                    <EmptyState
                      title="No trainers assigned"
                      description="Load appears once trainers confirm a batch."
                    />
                  }
                />
              </div>
            </section>
          </Card>
        </div>
      </PageSection>

      {/* The money and delivery pair, given the same treatment rather than
          left as a 2:1 split beside a table that is no longer there. */}
      <PageSection title="Money and delivery" hideTitle>
        <div className="grid items-stretch gap-8 xl:grid-cols-2">
          <Card className="h-full">
            <CardHeader as="h2" title="Collections" description="Billed against collected." />
            <div className="flex flex-col gap-6">
              <SegmentSplit
                label="Billed"
                retail={fromWire(collections.billed.retail)}
                college={fromWire(collections.billed.college)}
              />
              <SegmentSplit
                label="Collected"
                retail={fromWire(collections.collected.retail)}
                college={fromWire(collections.collected.college)}
              />
              <SegmentSplit
                label="Outstanding"
                retail={fromWire(collections.outstanding.retail)}
                college={fromWire(collections.outstanding.college)}
              />
              <SegmentSplit
                label="Overdue"
                retail={fromWire(collections.overdue.retail)}
                college={fromWire(collections.overdue.college)}
              />
            </div>
          </Card>

          <Card className="h-full">
            <CardHeader as="h2" title="Delivery" description="What is running right now." />
            <div className="flex flex-col gap-6">
              <SegmentSplit
                label="Active batches"
                retail={delivery.activeBatches.retail}
                college={delivery.activeBatches.college}
              />
              <SegmentSplit
                label="Certificates issued"
                retail={delivery.certificatesIssued.retail}
                college={delivery.certificatesIssued.college}
              />
              <dl className="flex justify-between gap-4 border-t border-hairline pt-4">
                <div className="flex flex-col">
                  <dt className="text-body-sm text-ink-muted">Sessions this week</dt>
                  <dd className="text-h3 text-ink tabular-nums">
                    {formatCount(delivery.sessionsThisWeek)}
                  </dd>
                </div>
                <div className="flex flex-col items-end">
                  <dt className="text-body-sm text-ink-muted">Completed</dt>
                  <dd className="text-h3 text-ink tabular-nums">
                    {formatCount(delivery.sessionsCompleted)}
                  </dd>
                </div>
              </dl>
            </div>
          </Card>
        </div>
      </PageSection>

    </PageBody>
  );
}
