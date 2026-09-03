import type { Metadata, Route } from "next";
import { formatRupees, fromWire, type Dashboard } from "@gurukulam/contracts";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody, PageSection, SplitLayout } from "@/components/patterns/page-section";
import { StatTile, StatTileGrid } from "@/components/patterns/stat-tile";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentSplit } from "@/features/dashboard/components/segment-split";
import { getDashboard } from "@/features/dashboard/server/dashboard-service";
import { brandTokens, domainTokens, feedbackTokens } from "@/design-system/tokens";
import { formatCount } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };

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
    icon: "nav-students",
    color: feedbackTokens.danger,
    href: "/students?allocation=unallocated",
  },
  {
    key: "overdueInstallments",
    label: "Overdue installments",
    caption: "Past their due date",
    icon: "nav-fee-ledger",
    color: feedbackTokens.danger,
    href: "/fee-ledger?status=overdue",
  },
  {
    key: "certificatesAwaitingApproval",
    label: "Certificates to approve",
    caption: "Waiting on a decision",
    icon: "nav-reports",
    color: feedbackTokens.warning,
    href: "/students/certificates?status=pending",
  },
  {
    key: "sessionsMissingRecordings",
    label: "Missing recordings",
    caption: "Completed sessions with no upload",
    icon: "nav-batches",
    color: feedbackTokens.warning,
    href: "/batches?recordings=missing",
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
        <span className="text-caption text-ink-muted tabular-nums">
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
  const { headline, actions, collections, delivery, scope } = dashboard;

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
            icon="nav-students"
            color={domainTokens.students}
            href="/students"
          />
          <StatTile
            label="Trainers"
            value={formatCount(headline.trainers)}
            caption="Active instructors"
            icon="nav-trainers"
            color={domainTokens.trainers}
            href="/trainers"
          />
          <StatTile
            label="Colleges"
            value={formatCount(headline.colleges)}
            caption="B2B partners"
            icon="nav-colleges"
            color={domainTokens.colleges}
            href="/colleges"
          />
          <StatTile
            label="Question bank"
            value={formatCount(headline.questionBank)}
            caption="Questions available"
            icon="nav-courses"
            color={domainTokens["question-bank"]}
            href="/courses/question-bank"
          />
        </StatTileGrid>
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

      <SplitLayout
        main={
          <Card padding="none" className="overflow-hidden">
            <div className="p-6 pb-0">
              <CardHeader
                as="h2"
                title="Course performance"
                description="Enrolment and revenue by course."
              />
            </div>
            <DataTable
              columns={COURSE_COLUMNS}
              rows={dashboard.topCourses}
              getRowId={(row) => row.courseId}
              caption="Courses by enrolment and revenue"
              empty={
                <EmptyState
                  title="No courses yet"
                  description="Course performance appears once students are enrolled."
                />
              }
            />
          </Card>
        }
        aside={
          <Card>
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
        }
      />

      <SplitLayout
        main={
          <Card padding="none" className="overflow-hidden">
            <div className="p-6 pb-0">
              <CardHeader as="h2" title="Trainer load" description="Who is carrying what." />
            </div>
            <DataTable
              columns={TRAINER_COLUMNS}
              rows={dashboard.trainerLoad}
              getRowId={(row) => row.trainerId}
              caption="Trainers by confirmed batches and upcoming sessions"
              empty={
                <EmptyState
                  title="No trainers assigned"
                  description="Load appears once trainers confirm a batch."
                />
              }
            />
          </Card>
        }
        aside={
          <Card>
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
        }
      />
    </PageBody>
  );
}
