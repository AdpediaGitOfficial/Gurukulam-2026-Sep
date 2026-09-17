import type { Metadata } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { Card } from "@/components/ui/card";
import { StudentForm } from "@/features/students/components/student-form";
import { getStudent } from "@/features/students/server/students-service";
import { listColleges } from "@/features/colleges/server/colleges-service";
import { listCities } from "@/features/localisation/server/localisation-service";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "Edit student" };

export default async function EditStudentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModule("students", "edit");
  const { id } = await params;
  // Colleges are still loaded: the picker is locked on edit, but the form is
  // one component and its create path needs them.
  const [student, cities, colleges] = await Promise.all([
    getStudent(id),
    listCities({ pageSize: "200", isActive: "true" }),
    listColleges({ pageSize: "200", isActive: "true" }),
  ]);

  const name = [student.firstName, student.lastName].filter(Boolean).join(" ");

  return (
    <PageBody>
      <PageHeader
        eyebrow={student.studentCode}
        title={name}
        description="Personal details only. Enrolment, pricing and credentials are set at allocation and corrected from the ledger."
        breadcrumbs={[
          { label: "Students", href: "/students" },
          { label: name, href: `/students/${student.studentId}` },
          { label: "Edit" },
        ]}
      />
      <Card className="max-w-3xl">
        <StudentForm cities={cities.rows} colleges={colleges.rows} student={student} />
      </Card>
    </PageBody>
  );
}
