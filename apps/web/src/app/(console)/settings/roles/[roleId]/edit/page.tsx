import type { Metadata } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { Card } from "@/components/ui/card";
import { RoleForm } from "@/features/settings/components/role-form";
import { getRole } from "@/features/settings/server/settings-service";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "Edit role" };

export default async function EditRolePage({
  params,
}: {
  params: Promise<{ roleId: string }>;
}) {
  await requireModule("settings", "edit");
  const { roleId } = await params;
  const role = await getRole(roleId);

  return (
    <PageBody>
      <PageHeader
        eyebrow="Settings"
        title={role.name}
        description={
          role.operatorCount === undefined || role.operatorCount === 0
            ? "Nobody holds this role yet."
            : `${role.operatorCount} operator(s) hold this role — a change here changes what all of them can reach.`
        }
        breadcrumbs={[
          { label: "Settings", href: "/settings" },
          { label: "Roles", href: "/settings/roles" },
          { label: role.name },
        ]}
      />
      <Card className="max-w-4xl">
        <RoleForm role={role} />
      </Card>
    </PageBody>
  );
}
