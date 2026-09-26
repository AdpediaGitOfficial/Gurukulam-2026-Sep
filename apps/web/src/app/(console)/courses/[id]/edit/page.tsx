import type { Metadata } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { Card } from "@/components/ui/card";
import { CourseForm } from "@/features/courses/components/course-form";
import { getCourse } from "@/features/courses/server/courses-service";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "Edit course" };

export default async function EditCoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModule("courses", "edit");
  const { id } = await params;
  const course = await getCourse(id);

  return (
    <PageBody>
      <PageHeader
        eyebrow={course.courseCode}
        title={course.name}
        description="Changing the standard market value affects enrolments recorded from here on. Ledgers already written keep the value they were opened with."
        breadcrumbs={[{ label: "Courses", href: "/courses" }, { label: course.name }]}
      />
      <Card className="max-w-3xl">
        <CourseForm course={course} />
      </Card>
    </PageBody>
  );
}
