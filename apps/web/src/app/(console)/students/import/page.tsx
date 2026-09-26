import type { Metadata } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { StudentImportPanel } from "@/features/students/components/student-import-panel";
import { getCollege } from "@/features/colleges/server/colleges-service";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "Import students" };

/**
 * A college hands over a spreadsheet of forty names; a retail desk has a term
 * of walk-ins in a sheet nobody wants to retype. Both want the same thing —
 * get the RECORDS in — so this screen creates records and nothing else.
 *
 * `?collegeId=` pins every row to one institution, which is how the college
 * detail screen links here. The id is read from the query string but the
 * COLLEGE is loaded through the service, so scope is applied where it always
 * is (invariant 11) and a pasted id for somebody else's college 404s rather
 * than naming it.
 */
export default async function ImportStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ collegeId?: string | string[] }>;
}) {
  await requireModule("students", "edit");
  const params = await searchParams;
  const raw = Array.isArray(params.collegeId) ? params.collegeId[0] : params.collegeId;
  const college = raw ? await getCollege(raw) : null;

  return (
    <PageBody>
      <PageHeader
        eyebrow={college?.collegeCode}
        title="Import students"
        description={
          college
            ? `A file of ${college.name}'s students. It creates their records — course, batch, price and credentials are still decided per student at allocation.`
            : "A file of students, loaded into the register. It creates records only: everybody imported lands unallocated, and nothing is written until you have read the plan."
        }
        breadcrumbs={
          college
            ? [
                { label: "Colleges", href: "/colleges" },
                { label: college.name, href: `/colleges/${college.collegeId}` },
                { label: "Import students" },
              ]
            : [{ label: "Students", href: "/students" }, { label: "Import" }]
        }
      />
      <StudentImportPanel collegeId={college?.collegeId ?? null} collegeName={college?.name ?? null} />
    </PageBody>
  );
}
