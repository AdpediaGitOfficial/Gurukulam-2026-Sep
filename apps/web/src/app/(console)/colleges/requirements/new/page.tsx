import type { Metadata } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { Card } from "@/components/ui/card";
import { RequirementForm } from "@/features/requirements/components/requirement-form";
import { listColleges } from "@/features/colleges/server/colleges-service";
import { listCourses } from "@/features/courses/server/courses-service";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";

export const metadata: Metadata = { title: "Log a requirement" };

export default async function NewRequirementPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("requirements", "edit");
  const params = await searchParams;
  const collegeId = params["collegeId"];

  const [colleges, courses] = await Promise.all([
    listColleges({ pageSize: "200", isActive: "true" }),
    listCourses({ pageSize: "200", isActive: "true" }),
  ]);

  return (
    <PageBody>
      <PageHeader
        eyebrow="Colleges"
        title="Log a requirement"
        description="What a college has asked us to run. Nothing is scheduled by logging it — confirming it is what creates the dedicated batch."
        breadcrumbs={[
          { label: "Colleges", href: "/colleges" },
          { label: "Requirements", href: "/colleges/requirements" },
          { label: "Log" },
        ]}
      />
      <Card className="max-w-3xl">
        <RequirementForm
          colleges={colleges.rows}
          courses={courses.rows}
          {...(typeof collegeId === "string" ? { collegeId } : {})}
        />
      </Card>
    </PageBody>
  );
}
