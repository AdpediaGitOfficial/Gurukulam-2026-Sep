import type { Metadata } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { Card } from "@/components/ui/card";
import { ContactsForm } from "@/features/colleges/components/contacts-form";
import { getCollege } from "@/features/colleges/server/colleges-service";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "College contacts" };

export default async function CollegeContactsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModule("colleges", "edit");
  const { id } = await params;
  const college = await getCollege(id);

  return (
    <PageBody>
      <PageHeader
        eyebrow={college.collegeCode}
        title="Contacts"
        description="Who we deal with at this institution. The primary contact is who requirements and certificate approvals go to."
        breadcrumbs={[
          { label: "Colleges", href: "/colleges" },
          { label: college.name, href: `/colleges/${college.collegeId}` },
          { label: "Contacts" },
        ]}
      />
      <Card className="max-w-4xl">
        <ContactsForm college={college} />
      </Card>
    </PageBody>
  );
}
