import type { Metadata } from "next";
import Link from "next/link";
import { CALENDAR_GRID_DAYS, type CalendarEntry } from "@gurukulam/contracts";

import { ListFilters } from "@/components/patterns/list-filters";
import { ListPage } from "@/components/patterns/list-page";
import { StatTile, StatTileGrid } from "@/components/patterns/stat-tile";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { listCourses } from "@/features/courses/server/courses-service";
import { listCities } from "@/features/localisation/server/localisation-service";
import { getCalendar } from "@/features/trainers/server/trainers-service";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";
import { brandTokens, domainTokens, feedbackTokens } from "@/design-system/tokens";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Availability" };

const day = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const first = (value: string | string[] | undefined): string | undefined =>
  (Array.isArray(value) ? value[0] : value) ?? undefined;

/** "Mon 07" — the column head, in the same shape the schedule is read in. */
function dayLabel(date: string): { weekday: string; day: string } {
  const d = new Date(`${date}T00:00:00.000Z`);
  return {
    weekday: d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }),
    day: d.toLocaleDateString("en-GB", { day: "2-digit", timeZone: "UTC" }),
  };
}

/**
 * One trainer's day: what makes them contested, if anything.
 *
 * Leave outranks sessions in the cell. A day carrying both is a clash worth
 * seeing — the API refuses NEW leave over a committed session, but leave
 * declared first and a session added later can still collide, and the cell is
 * where that shows.
 */
function Cell({ sessions, away }: { sessions: number; away: boolean }) {
  if (away && sessions > 0) {
    return (
      <span
        className="inline-flex items-center rounded-control bg-danger px-2 py-1 text-caption font-medium text-white"
        title={`Away, with ${sessions} session(s) still scheduled`}
      >
        clash
      </span>
    );
  }
  if (away) {
    return (
      <span className="inline-flex items-center rounded-control bg-surface-muted px-2 py-1 text-caption font-medium text-ink-muted">
        away
      </span>
    );
  }
  if (sessions > 0) {
    return (
      <span className="inline-flex items-center rounded-control bg-brand/10 px-2 py-1 text-caption font-medium text-brand">
        {sessions === 1 ? "1 session" : `${sessions} sessions`}
      </span>
    );
  }
  return <span className="text-ink-subtle">·</span>;
}

/** The grid an admin assigns from: trainers down, days across. */
function Grid({ entries, days }: { entries: readonly CalendarEntry[]; days: readonly string[] }) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className="w-full border-collapse text-left"
        style={{ minWidth: `${240 + days.length * 92}px` }}
      >
        <caption className="sr-only">
          Trainer availability across the window, computed from committed sessions and declared
          leave
        </caption>
        <thead className="bg-surface-sunken">
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-10 bg-surface-sunken px-4 py-3 text-caption font-bold tracking-wide text-ink-muted uppercase"
            >
              Trainer
            </th>
            {days.map((date) => {
              const label = dayLabel(date);
              return (
                <th
                  key={date}
                  scope="col"
                  className="px-3 py-3 text-center text-caption font-bold tracking-wide text-ink-muted uppercase"
                >
                  <span className="block">{label.weekday}</span>
                  <span className="block text-body-sm font-semibold text-ink">{label.day}</span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.trainerId} className="border-t border-hairline">
              <th
                scope="row"
                className="sticky left-0 z-10 bg-surface px-4 py-3 text-left font-normal"
              >
                <Link href={`/trainers/${entry.trainerId}`} className="flex flex-col hover:underline">
                  <span className="flex items-center gap-2 text-body font-semibold text-ink">
                    {entry.name}
                    {/* Only present when a course was named. Approval is what
                        decides whether a proposal is even allowed. */}
                    {entry.approvedForCourse === false ? (
                      <span className="text-caption font-normal text-ink-subtle">
                        not approved
                      </span>
                    ) : null}
                  </span>
                  <span className="font-mono text-caption text-ink-subtle">
                    {entry.trainerCode}
                  </span>
                </Link>
              </th>
              {entry.days.map((cell) => (
                <td key={cell.date} className="px-3 py-3 text-center">
                  <Cell sessions={cell.sessions} away={cell.away} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The window totals, for a span too long to draw a day at a time. */
function Totals({ entries }: { entries: readonly CalendarEntry[] }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse text-left" style={{ minWidth: "900px" }}>
        <caption className="sr-only">Trainer commitments across the window</caption>
        <thead className="bg-surface-sunken">
          <tr>
            {["Trainer", "Sessions", "Hours", "Declared away", "Status"].map((head, index) => (
              <th
                key={head}
                scope="col"
                className={cn(
                  "px-4 py-3 text-caption font-bold tracking-wide text-ink-muted uppercase",
                  index > 0 && index < 4 && "text-right",
                )}
              >
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.trainerId} className="border-t border-hairline">
              <td className="px-4 py-3">
                <Link href={`/trainers/${entry.trainerId}`} className="flex flex-col hover:underline">
                  <span className="text-body font-semibold text-ink">{entry.name}</span>
                  <span className="font-mono text-caption text-ink-subtle">
                    {entry.trainerCode}
                  </span>
                </Link>
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatCount(entry.committedSessions)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {entry.committedHours}
                {entry.maxWeeklyHours === null ? "" : ` / ${entry.maxWeeklyHours} per week`}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {entry.declaredAway === 0 ? (
                  <span className="text-ink-subtle">—</span>
                ) : (
                  formatCount(entry.declaredAway)
                )}
              </td>
              <td className="px-4 py-3">
                {entry.approvedForCourse === false ? (
                  <StatusPill intent="neutral">not approved</StatusPill>
                ) : entry.free ? (
                  <StatusPill intent="success">free</StatusPill>
                ) : entry.overCommitted ? (
                  <StatusPill intent="danger">over their cap</StatusPill>
                ) : (
                  <StatusPill intent="warning">committed</StatusPill>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("trainers");
  const params = await searchParams;

  /*
   * The window is required by the endpoint, so the page supplies one rather
   * than refusing to render. A fortnight from today is the span an assignment
   * is actually decided over — long enough to see a batch start, short enough
   * to read a day at a time.
   */
  const today = new Date();
  const from = first(params["from"]) ?? iso(today);
  const to = first(params["to"]) ?? iso(new Date(today.getTime() + 13 * day));

  const [entries, cities, courses] = await Promise.all([
    getCalendar({ ...params, from, to }),
    listCities({ pageSize: "200", isActive: "true" }),
    listCourses({ pageSize: "200", isActive: "true" }),
  ]);

  const days = entries[0]?.days.map((d) => d.date) ?? [];
  const span = Math.round((Date.parse(to) - Date.parse(from)) / day) + 1;

  const free = entries.filter((e) => e.free).length;
  const sessions = entries.reduce((sum, e) => sum + e.committedSessions, 0);
  const away = entries.filter((e) => e.declaredAway > 0).length;
  const over = entries.filter((e) => e.overCommitted).length;
  const courseNamed = first(params["courseId"]) !== undefined;
  const eligible = courseNamed
    ? entries.filter((e) => e.approvedForCourse === true && e.free).length
    : free;

  return (
    <ListPage
      eyebrow="Trainers"
      title="Availability calendar"
      description="Free/busy is computed from committed sessions plus declared leave — never stored. This is the surface you assign from."
      summary={
        /* Naming a course is the picker's real question: a proposal to someone
           unapproved is refused at the batch, so it is worth saying up front
           how many of these people could actually take it. */
        courseNamed ? (
          <Alert intent="info" title="Narrowed to one course">
            {formatCount(eligible)} trainer(s) are both approved for it and free across this
            window. Anyone marked “not approved” cannot be proposed for that course at all.
          </Alert>
        ) : null
      }
      toolbar={
        <ListFilters
          params={params}
          dates={[
            { name: "from", label: "From", defaultValue: from },
            { name: "to", label: "To", defaultValue: to },
          ]}
          selects={[
            {
              name: "courseId",
              label: "Course",
              options: [
                { value: "", label: "Any course" },
                ...courses.rows.map((course) => ({
                  value: course.courseId,
                  label: course.name,
                })),
              ],
            },
            {
              name: "cityId",
              label: "City",
              options: [
                { value: "", label: "All cities" },
                ...cities.rows.map((city) => ({ value: city.cityId, label: city.name })),
              ],
            },
            {
              name: "freeOnly",
              label: "Availability",
              options: [
                { value: "", label: "Everyone" },
                { value: "true", label: "Only those free" },
              ],
            },
          ]}
        />
      }
    >
      <StatTileGrid className="mb-6">
        <StatTile
          label={courseNamed ? "Approved and free" : "Free in this window"}
          value={formatCount(eligible)}
          caption={`Of ${formatCount(entries.length)} active trainer(s)`}
          icon="check"
          color={eligible === 0 ? feedbackTokens.warning : feedbackTokens.success}
        />
        <StatTile
          label="Committed sessions"
          value={formatCount(sessions)}
          caption="Across the whole window"
          icon="batch"
          color={domainTokens.trainers}
        />
        <StatTile
          label="Declared away"
          value={formatCount(away)}
          caption="Trainers with leave or blocked time"
          icon="clock"
          color={away === 0 ? brandTokens.inkMuted : feedbackTokens.warning}
        />
        <StatTile
          label="Over their cap"
          value={formatCount(over)}
          caption="Committed beyond max weekly hours"
          icon="warn"
          color={over === 0 ? brandTokens.inkMuted : feedbackTokens.danger}
        />
      </StatTileGrid>

      <Card padding="none" className="overflow-hidden">
        {entries.length === 0 ? (
          <EmptyState
            title="No trainers match those filters"
            description="Only active trainers appear here — an inactive account cannot be proposed for a batch."
          />
        ) : days.length > 0 ? (
          <Grid entries={entries} days={days} />
        ) : (
          <Totals entries={entries} />
        )}
      </Card>

      {days.length === 0 && entries.length > 0 ? (
        <p className="mt-3 text-body-sm text-ink-muted">
          A {span}-day window is too long to draw a day at a time, so this is the window total per
          trainer. Narrow it to {CALENDAR_GRID_DAYS} days or fewer for the day-by-day grid.
        </p>
      ) : null}

      <p className="mt-3 text-body-sm text-ink-muted">
        A trainer is only proposable for a batch of a course they are approved for. Proposing is
        done from the batch itself, and is not delivery until they confirm.
      </p>
    </ListPage>
  );
}
