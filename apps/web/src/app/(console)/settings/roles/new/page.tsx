import type { Metadata } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { Card } from "@/components/ui/card";
import { RoleForm } from "@/features/settings/components/role-form";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "Add a role" };

export default async function NewRolePage() {
  await requireModule("settings", "edit");

  return (
    <PageBody>
      <PageHeader
        eyebrow="Settings"
        title="Add a role"
        description="A named set of permissions. Operators are given one rather than being granted access module by module."
        breadcrumbs={[
          { label: "Settings", href: "/settings" },
          { label: "Roles", href: "/settings/roles" },
          { label: "Add" },
        ]}
      />
      <Card className="max-w-4xl">
        <RoleForm />
      </Card>
    </PageBody>
  );
}
