import type { Metadata } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { Card } from "@/components/ui/card";
import { JobForm } from "@/features/hiring/components/job-form";
import { listCourses } from "@/features/courses/server/courses-service";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "Post a role" };

export default async function NewJobPage() {
  await requireModule("hiring", "edit");
  const courses = await listCourses({ pageSize: "200" });

  return (
    <PageBody>
      <PageHeader
        eyebrow="Hiring"
        title="Post a role"
        description="Saved as a draft. You will see how many students it reaches before deciding to publish."
        breadcrumbs={[{ label: "Hiring", href: "/hiring" }, { label: "Post a role" }]}
      />
      <Card className="max-w-4xl">
        <JobForm courses={courses.rows} />
      </Card>
    </PageBody>
  );
}
