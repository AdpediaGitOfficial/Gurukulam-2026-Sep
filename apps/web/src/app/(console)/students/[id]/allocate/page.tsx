import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { Alert } from "@/components/ui/alert";
import { AllocationForm } from "@/features/students/components/allocation-form";
import {
  getStudent,
  listJoinableBatches,
} from "@/features/students/server/students-service";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "Allocate to a batch" };

export default async function AllocatePage({ params }: { params: Promise<{ id: string }> }) {
  // Allocation writes — a principal with read-only students may not do it.
  await requireModule("students", "edit");
  const { id } = await params;
  const student = await getStudent(id);

  // Already in a batch: nothing here would be additive, and re-running the
  // transaction would create a second ledger for the same enrolment.
  if (student.isAllocated === true) redirect(`/students/${id}`);

  const batches = await listJoinableBatches(student);
  const name = student.lastName === null ? student.firstName : `${student.firstName} ${student.lastName}`;

  return (
    <PageBody>
      <PageHeader
        eyebrow="Students"
        title="Allocate to a batch"
        description={`${name} · ${student.studentCode}`}
        breadcrumbs={[
          { label: "Students", href: "/students" },
          { label: name, href: `/students/${id}` },
          { label: "Allocate" },
        ]}
      />

      <Alert intent="info" title="One transaction">
        Batch mapping, access to every session in that batch — past and future — the fee ledger,
        its schedule and portal credentials are written together. Either all of it lands or none
        of it does, so a half-allocated student cannot exist.
      </Alert>

      <AllocationForm student={student} batches={batches.rows} />
    </PageBody>
  );
}
