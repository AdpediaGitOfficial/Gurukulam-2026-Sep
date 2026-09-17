import type { Metadata } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { AdministratorForm } from "@/features/settings/components/administrator-form";
import { listCities } from "@/features/localisation/server/localisation-service";
import { listRoles } from "@/features/settings/server/settings-service";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "Add an operator" };

export default async function NewAdministratorPage() {
  await requireModule("settings", "edit");
  const [roles, cities] = await Promise.all([
    listRoles({ pageSize: "200" }),
    listCities({ pageSize: "200", isActive: "true" }),
  ]);

  return (
    <PageBody>
      <PageHeader
        eyebrow="Settings"
        title="Add an operator"
        description="Creates the account and issues its first password, which is shown once and never again — nothing emails it."
        breadcrumbs={[
          { label: "Settings", href: "/settings" },
          { label: "Administrators", href: "/settings/administrators" },
          { label: "Add" },
        ]}
      />
      <div className="max-w-4xl">
        <AdministratorForm roles={roles.rows} cities={cities.rows} />
      </div>
    </PageBody>
  );
}
