import type { Metadata } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { QuestionForm, type CourseOption } from "@/features/questions/components/question-form";
import { getQuestion } from "@/features/questions/server/questions-service";
import { listCourses } from "@/features/courses/server/courses-service";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "Edit a question" };

/**
 * Correcting a question.
 *
 * `updateQuestionSchema` IS `createQuestionSchema` — an update posts the whole
 * question. A partial update of a set of options is not a thing that can be
 * expressed coherently: removing the third option and changing the answer are
 * one edit, not two.
 */
export default async function EditQuestionPage({
  params,
}: {
  params: Promise<{ questionId: string }>;
}) {
  await requireModule("courses", "edit");
  const { questionId } = await params;
  const [question, courses] = await Promise.all([
    getQuestion(questionId),
    listCourses({ pageSize: "200" }),
  ]);
  const options: CourseOption[] = courses.rows.map((course) => ({
    courseId: course.courseId,
    name: course.name,
  }));

  return (
    <PageBody>
      <PageHeader
        eyebrow={question.courseName ?? "Courses"}
        title="Edit question"
        description={question.questionText.slice(0, 120)}
        breadcrumbs={[
          { label: "Courses", href: "/courses" },
          { label: "Question bank", href: "/courses/question-bank" },
          { label: "Edit" },
        ]}
      />
      <QuestionForm courses={options} question={question} />
    </PageBody>
  );
}
