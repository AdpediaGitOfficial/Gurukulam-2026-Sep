import type { Metadata } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { Card } from "@/components/ui/card";
import { CourseForm } from "@/features/courses/components/course-form";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "Add a course" };

export default async function NewCoursePage() {
  await requireModule("courses", "edit");
  return (
    <PageBody>
      <PageHeader
        eyebrow="Courses"
        title="Add a course"
        description="A course holds topics; a batch runs the whole structure on a schedule."
        breadcrumbs={[{ label: "Courses", href: "/courses" }, { label: "Add" }]}
      />
      <Card className="max-w-4xl">
        <CourseForm />
      </Card>
    </PageBody>
  );
}
