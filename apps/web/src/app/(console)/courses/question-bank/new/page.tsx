import type { Metadata } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { QuestionForm, type CourseOption } from "@/features/questions/components/question-form";
import { listCourses } from "@/features/courses/server/courses-service";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "Add a question" };

export default async function NewQuestionPage() {
  await requireModule("courses", "edit");
  const courses = await listCourses({ pageSize: "200" });
  const options: CourseOption[] = courses.rows.map((course) => ({
    courseId: course.courseId,
    name: course.name,
  }));

  return (
    <PageBody>
      <PageHeader
        eyebrow="Courses"
        title="Add a question"
        description="Assessment belongs to a course, so every question names one."
        breadcrumbs={[
          { label: "Courses", href: "/courses" },
          { label: "Question bank", href: "/courses/question-bank" },
          { label: "New question" },
        ]}
      />
      <QuestionForm courses={options} />
    </PageBody>
  );
}
