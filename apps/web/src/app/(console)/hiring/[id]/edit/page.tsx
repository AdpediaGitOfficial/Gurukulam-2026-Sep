import type { Metadata } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { JobForm } from "@/features/hiring/components/job-form";
import { getJob } from "@/features/hiring/server/hiring-service";
import { listCourses } from "@/features/courses/server/courses-service";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "Edit posting" };

/**
 * Editing a posting, including who it reaches.
 *
 * A published posting is still editable — a closing date moves and a salary
 * band gets corrected — and because the audience is evaluated on READ rather
 * than written out per student, changing a rule re-decides who sees it, live.
 */
export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModule("hiring", "edit");
  const { id } = await params;
  const [job, courses] = await Promise.all([
    getJob(id),
    listCourses({ pageSize: "200" }),
  ]);

  return (
    <PageBody>
      <PageHeader
        eyebrow={job.jobCode}
        title="Edit posting"
        description="The role, and the rules that decide which students see it."
        breadcrumbs={[
          { label: "Hiring", href: "/hiring" },
          { label: job.roleTitle, href: `/hiring/${job.jobPostingId}` },
          { label: "Edit" },
        ]}
      />
      <JobForm courses={courses.rows} job={job} />
    </PageBody>
  );
}
