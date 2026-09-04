import type { Metadata } from "next";
import Link from "next/link";
import { formatRupees, fromWire, type StudentDetail } from "@gurukulam/contracts";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody, PageSection } from "@/components/patterns/page-section";
import { SegmentTag } from "@/components/patterns/segment-tag";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { getStudent } from "@/features/students/server/students-service";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";
import { formatCount } from "@/lib/format";

export const metadata: Metadata = { title: "Student" };

const fullName = (s: StudentDetail) =>
  s.lastName === null ? s.firstName : `${s.firstName} ${s.lastName}`;

const money = (minor: string) => formatRupees(fromWire(minor), { paise: false });

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-hairline py-3 last:border-b-0">
      <dt className="text-body-sm text-ink-subtle">{label}</dt>
      <dd className="text-right text-body-sm font-medium text-ink">{value}</dd>
    </div>
  );
}

export default async function StudentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("students");
  const { id } = await params;
  const query = await searchParams;
  const student = await getStudent(id);

  const retail = student.enrolmentChannel === "RETAIL";

  return (
    <PageBody>
      <PageHeader
        eyebrow="Students"
        title={fullName(student)}
        description={`${student.studentCode} · ${student.email}`}
        breadcrumbs={[
          { label: "Students", href: "/students" },
          { label: fullName(student) },
        ]}
        action={
          <div className="flex items-center gap-3">
            <Link
              href={`/students/${student.studentId}/edit`}
              className={buttonVariants({ variant: "secondary" })}
            >
              Edit
            </Link>
            {student.isAllocated === true ? null : (
              <Link
                href={`/students/${student.studentId}/allocate`}
                className={buttonVariants({ variant: "primary" })}
              >
                Allocate to a batch
              </Link>
            )}
          </div>
        }
      />

      {query["allocated"] === "1" ? (
        <Alert intent="success" title="Allocated">
          Batch mapping, session access, ledger and credentials were written together.
        </Alert>
      ) : query["saved"] === "1" ? (
        <Alert intent="success" title="Saved">
          Student updated.
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <SegmentTag segment={student.enrolmentChannel} />
        <StatusPill intent={student.accountStatus === "ACTIVE" ? "success" : "neutral"}>
          {student.accountStatus.toLowerCase()}
        </StatusPill>
        {student.isAllocated === false ? (
          <StatusPill intent="warning">Unallocated</StatusPill>
        ) : null}
      </div>

      <div className="grid gap-8 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader as="h2" title="Profile" />
          <dl>
            <Row label="Student code" value={<span className="font-mono">{student.studentCode}</span>} />
            <Row label="Email" value={student.email} />
            <Row label="Phone" value={student.phone ?? "—"} />
            <Row label="Segment" value={retail ? "Retail — walk-in" : "College — institutional"} />
            {/* A retail student has no college and never will (invariant 1). */}
            <Row
              label="College"
              value={student.collegeName ?? <span className="text-ink-subtle">None</span>}
            />
            <Row label="City" value={student.cityName ?? "—"} />
            <Row label="Discipline" value={student.discipline ?? "—"} />
            <Row label="Passout year" value={student.passoutYear === null ? "—" : String(student.passoutYear)} />
          </dl>
        </Card>

        <Card>
          <CardHeader
            as="h2"
            title="Provenance"
            description="Who created this record, and when."
          />
          <dl>
            {/*
              Every record carries its author. A college-created student shows
              the college user, which is what makes institutional intake
              auditable rather than merely recorded.
            */}
            <Row
              label="Created by"
              value={student.createdByType.replace(/_/g, " ").toLowerCase()}
            />
            <Row label="Created" value={new Date(student.createdAt).toLocaleString("en-IN")} />
            <Row
              label="Credentials"
              value={
                student.credentialsIssuedAt === null
                  ? "Not issued"
                  : new Date(student.credentialsIssuedAt).toLocaleDateString("en-IN")
              }
            />
            <Row
              label="Last signed in"
              value={
                student.lastLoginAt === null
                  ? "Never"
                  : new Date(student.lastLoginAt).toLocaleString("en-IN")
              }
            />
          </dl>
        </Card>
      </div>

      <PageSection title="Enrolments" description="The batches this student sits on.">
        <Card padding="none" className="overflow-hidden">
          {student.batches.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="Not in a batch yet"
                description="Allocation is what turns a student record into an enrolment — course, batch, price, schedule and credentials, in one transaction."
              />
            </div>
          ) : (
            <ul className="flex flex-col">
              {student.batches.map((batch) => (
                <li
                  key={batch.batchId}
                  className="flex flex-wrap items-center gap-4 border-b border-hairline p-4 last:border-b-0"
                >
                  <Link
                    href={`/batches/${batch.batchId}`}
                    className="min-w-0 flex-1 hover:underline"
                  >
                    <span className="block text-body font-semibold text-ink">{batch.name}</span>
                    <span className="block font-mono text-caption text-ink-subtle">
                      {batch.batchCode} · {batch.courseName ?? "—"}
                    </span>
                  </Link>
                  <SegmentTag segment={batch.segment} />
                  <span className="text-body-sm text-ink-muted">
                    enrolled {new Date(batch.enrolledAt).toLocaleDateString("en-IN")}
                  </span>
                  <StatusPill intent={batch.status === "COMPLETED" ? "success" : "info"}>
                    {batch.status.replace(/_/g, " ").toLowerCase()}
                  </StatusPill>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </PageSection>

      <PageSection
        title="Fees"
        description={
          retail
            ? "What this student owes, and what has been collected."
            : "A college student has no individual ledger — the institution is billed under a contract instead."
        }
      >
        <Card padding="none" className="overflow-hidden">
          {student.ledgers.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title={retail ? "No ledger yet" : "Billed through the institution"}
                description={
                  retail
                    ? "A ledger is created at allocation, along with its installment schedule."
                    : "Billing follows segment: college students carry no individual ledger."
                }
              />
            </div>
          ) : (
            <ul className="flex flex-col">
              {student.ledgers.map((ledger) => (
                <li
                  key={ledger.ledgerId}
                  className="flex flex-wrap items-center gap-6 border-b border-hairline p-4 last:border-b-0"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-body-sm text-ink-subtle">Enrolment value</span>
                    <span className="block font-mono text-h3 text-ink tabular-nums">
                      {money(ledger.enrolmentValueMinor)}
                    </span>
                  </span>
                  <span>
                    <span className="block text-body-sm text-ink-subtle">Paid</span>
                    <span className="block font-mono text-body font-semibold text-success-strong tabular-nums">
                      {money(ledger.totalPaidMinor)}
                    </span>
                  </span>
                  <span>
                    <span className="block text-body-sm text-ink-subtle">Balance</span>
                    <span className="block font-mono text-body font-semibold text-warning-strong tabular-nums">
                      {money(ledger.balancePendingMinor)}
                    </span>
                  </span>
                  <span>
                    <span className="block text-body-sm text-ink-subtle">Installments</span>
                    <span className="block text-body tabular-nums">
                      {formatCount(ledger.installmentCount)}
                    </span>
                  </span>
                  <StatusPill intent={ledger.status === "PAID_FULL" ? "success" : "warning"}>
                    {ledger.status.replace(/_/g, " ").toLowerCase()}
                  </StatusPill>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </PageSection>
    </PageBody>
  );
}
