import type { Metadata } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { AdministratorForm } from "@/features/settings/components/administrator-form";
import { ResetPasswordForm } from "@/features/settings/components/reset-password-form";
import { listCities } from "@/features/localisation/server/localisation-service";
import {
  getAdministrator,
  listRoles,
} from "@/features/settings/server/settings-service";
import { requireModule } from "@/server/principal";

export const metadata: Metadata = { title: "Edit operator" };

export default async function EditAdministratorPage({
  params,
}: {
  params: Promise<{ adminUserId: string }>;
}) {
  // `requireModule` returns the principal, so identifying your own record
  // costs nothing extra — and invariant 19 turns on exactly that comparison.
  const me = await requireModule("settings", "edit");
  const { adminUserId } = await params;
  const [admin, roles, cities] = await Promise.all([
    getAdministrator(adminUserId),
    listRoles({ pageSize: "200" }),
    listCities({ pageSize: "200", isActive: "true" }),
  ]);

  return (
    <PageBody>
      <PageHeader
        eyebrow="Settings"
        title={admin.name}
        description={admin.email}
        breadcrumbs={[
          { label: "Settings", href: "/settings" },
          { label: "Administrators", href: "/settings/administrators" },
          { label: admin.name },
        ]}
      />
      <div className="flex max-w-4xl flex-col gap-8">
        <AdministratorForm
          roles={roles.rows}
          cities={cities.rows}
          admin={admin}
          isSelf={me.id === admin.adminUserId}
        />

        {/* Not offered on your own account: you change your own password from
            Account, where you type the one you already know rather than being
            handed a temporary one. */}
        {me.id === admin.adminUserId ? null : (
          <ResetPasswordForm adminUserId={admin.adminUserId} name={admin.name} />
        )}
      </div>
    </PageBody>
  );
}
