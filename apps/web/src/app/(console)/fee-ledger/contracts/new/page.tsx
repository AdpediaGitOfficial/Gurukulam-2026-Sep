import type { Metadata } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { Alert } from "@/components/ui/alert";
import { ContractForm, type Option } from "@/features/ledger/components/contract-form";
import { listColleges } from "@/features/colleges/server/colleges-service";
import { listCourses } from "@/features/courses/server/courses-service";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "New contract" };

/**
 * The commercial agreement behind a college engagement.
 *
 * Invariant 3 — billing follows segment. A retail student is billed on their
 * own ledger; a college student is not billed at all, because their
 * institution is, under this. That is why the contract names a college and
 * never a student.
 */
export default async function NewContractPage({
  searchParams,
}: {
  searchParams: Promise<{ collegeId?: string | string[] }>;
}) {
  await requireModule("feeLedger", "edit");
  await searchParams;

  const [colleges, courses] = await Promise.all([
    listColleges({ pageSize: "200" }),
    listCourses({ pageSize: "200" }),
  ]);

  const collegeOptions: Option[] = colleges.rows.map((c) => ({ id: c.collegeId, label: c.name }));
  const courseOptions: Option[] = courses.rows.map((c) => ({ id: c.courseId, label: c.name }));

  return (
    <PageBody>
      <PageHeader
        eyebrow="Fee ledger"
        title="New contract"
        description="What a college is billed, and on what basis. Its students carry no individual ledger."
        breadcrumbs={[
          { label: "Fee ledger", href: "/fee-ledger" },
          { label: "Contracts", href: "/fee-ledger/contracts" },
          { label: "New" },
        ]}
      />

      <Alert intent="info" title="The schedule comes next">
        A contract records the commercials. The instalments that actually bill them are authored on
        its own screen once it exists — one instalment engine, two parents.
      </Alert>

      <ContractForm colleges={collegeOptions} courses={courseOptions} />
    </PageBody>
  );
}
