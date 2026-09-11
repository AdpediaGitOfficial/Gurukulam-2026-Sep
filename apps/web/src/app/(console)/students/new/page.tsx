import type { Metadata } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { Card } from "@/components/ui/card";
import { StudentForm } from "@/features/students/components/student-form";
import { listColleges } from "@/features/colleges/server/colleges-service";
import { listCities } from "@/features/localisation/server/localisation-service";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "Add a student" };

export default async function NewStudentPage() {
  await requireModule("students", "edit");
  const [cities, colleges] = await Promise.all([
    listCities({ pageSize: "200", isActive: "true" }),
    listColleges({ pageSize: "200", isActive: "true" }),
  ]);

  return (
    <PageBody>
      <PageHeader
        eyebrow="Students"
        title="Add a student"
        description="Creates the record only. Course, batch, price and credentials are decided at allocation."
        breadcrumbs={[{ label: "Students", href: "/students" }, { label: "Add" }]}
      />
      <Card className="max-w-4xl">
        <StudentForm cities={cities.rows} colleges={colleges.rows} />
      </Card>
    </PageBody>
  );
}
