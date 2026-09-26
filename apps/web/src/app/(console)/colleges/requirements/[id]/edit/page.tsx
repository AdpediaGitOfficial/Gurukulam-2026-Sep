import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { Alert } from "@/components/ui/alert";
import { RequirementForm } from "@/features/requirements/components/requirement-form";
import { getRequirement } from "@/features/requirements/server/requirements-service";
import { listColleges } from "@/features/colleges/server/colleges-service";
import { listCourses } from "@/features/courses/server/courses-service";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "Edit a requirement" };

/**
 * Correcting an ask before it is answered.
 *
 * Only while it is still NEW or UNDER_REVIEW. Confirming a requirement creates
 * its dedicated batch in one transaction (invariant 14), so once that has
 * happened the headcount and the window are facts the batch was built from —
 * changing them here would leave the two disagreeing with nothing to
 * reconcile them.
 */
export default async function EditRequirementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModule("requirements", "edit");
  const { id } = await params;
  const requirement = await getRequirement(id);

  if (requirement.status !== "NEW" && requirement.status !== "UNDER_REVIEW") {
    redirect(`/colleges/requirements/${id}`);
  }

  const [colleges, courses] = await Promise.all([
    listColleges({ pageSize: "200" }),
    listCourses({ pageSize: "200" }),
  ]);

  return (
    <PageBody>
      <PageHeader
        eyebrow={requirement.requirementCode}
        title="Edit requirement"
        description={`${requirement.collegeName ?? "—"} · ${requirement.courseName ?? "—"}`}
        breadcrumbs={[
          { label: "Colleges", href: "/colleges" },
          { label: "Requirements", href: "/colleges/requirements" },
          { label: requirement.requirementCode, href: `/colleges/requirements/${id}` },
          { label: "Edit" },
        ]}
      />

      <Alert intent="info" title="Correcting the ask, not answering it">
        Confirming creates the dedicated batch and rejecting tells the college why. Both are their
        own acts — this only changes what was asked for.
      </Alert>

      <RequirementForm
        colleges={colleges.rows}
        courses={courses.rows}
        requirement={requirement}
      />
    </PageBody>
  );
}
