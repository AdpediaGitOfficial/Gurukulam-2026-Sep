import type { Metadata } from "next";
import { MODULES, type ModuleName, type Role } from "@gurukulam/contracts";

import { ModuleTabs } from "@/components/patterns/module-tabs";
import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { Card, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { StatusPill } from "@/components/ui/status-pill";
import { listRoles } from "@/features/settings/server/settings-service";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Roles" };

/** `feeLedger` → "Fee ledger". The contract's key is not a label. */
const MODULE_LABELS: Record<ModuleName, string> = {
  dashboard: "Dashboard",
  colleges: "Colleges",
  students: "Students",
  courses: "Courses",
  batches: "Batches",
  trainers: "Trainers",
  feeLedger: "Fee ledger",
  hiring: "Hiring",
  reports: "Reports",
  requirements: "Requirements",
  certificates: "Certificates",
  notifications: "Notifications",
  settings: "Settings",
};

/**
 * Read, edit and delete for one module, as three cells' worth of state in one.
 *
 * Shown as letters rather than three ticks because a matrix of 13 modules by
 * three actions is 39 marks per row — letters stay readable where ticks turn
 * into texture.
 */
function PermissionCell({ role, module }: { role: Role; module: ModuleName }) {
  const permission = role.permissions[module];
  const granted = [
    permission?.read === true ? "R" : null,
    permission?.edit === true ? "E" : null,
    permission?.delete === true ? "D" : null,
  ].filter(Boolean);

  if (granted.length === 0) {
    return (
      <span className="text-caption text-ink-subtle" title="No access">
        —
      </span>
    );
  }

  return (
    <span
      title={`${MODULE_LABELS[module]}: ${granted.join(", ")}`}
      className={cn(
        "inline-flex items-center gap-px rounded-chip px-1.5 py-0.5 font-mono text-caption font-bold",
        granted.includes("D")
          ? "bg-danger/10 text-danger"
          : granted.includes("E")
            ? "bg-brand/10 text-brand"
            : "bg-surface-muted text-ink-muted",
      )}
    >
      {granted.join("")}
    </span>
  );
}

export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("settings");
  const params = await searchParams;
  const page = await listRoles(params);

  return (
    <PageBody>
      <PageHeader
        eyebrow="Settings"
        title="Roles & permissions"
        description="Module-level permissions per role. A role plus a scope is what every query is filtered by."
      />
      <ModuleTabs />

      <Card padding="none" className="overflow-hidden">
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-left" style={{ minWidth: "1400px" }}>
            <caption className="sr-only">
              Roles against modules. R is read, E is edit, D is delete.
            </caption>
            <thead className="bg-surface-sunken">
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 z-10 bg-surface-sunken px-4 py-3 text-caption font-bold tracking-wide text-ink-muted uppercase"
                >
                  Role
                </th>
                {MODULES.map((module) => (
                  <th
                    key={module}
                    scope="col"
                    className="px-3 py-3 text-center text-caption font-bold tracking-wide text-ink-muted uppercase"
                  >
                    {MODULE_LABELS[module]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {page.rows.map((role) => (
                <tr
                  key={role.roleId}
                  className="border-b border-hairline last:border-b-0 hover:bg-surface-sunken"
                >
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-surface px-4 py-4 text-left align-middle font-normal"
                  >
                    <span className="flex flex-col gap-1">
                      <span className="text-body font-semibold text-ink">{role.name}</span>
                      {role.isSystem ? (
                        <StatusPill intent="info">System role</StatusPill>
                      ) : null}
                      {role.operatorCount === undefined ? null : (
                        <span className="text-caption text-ink-subtle tabular-nums">
                          {role.operatorCount}{" "}
                          {role.operatorCount === 1 ? "operator" : "operators"}
                        </span>
                      )}
                    </span>
                  </th>
                  {MODULES.map((module) => (
                    <td key={module} className="px-3 py-4 text-center align-middle">
                      <PermissionCell role={role} module={module} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader as="h2" title="Reading the matrix" />
        <div className="flex flex-wrap items-center gap-6">
          <span className="flex items-center gap-2 text-body-sm text-ink-muted">
            <span className="rounded-chip bg-surface-muted px-1.5 py-0.5 font-mono text-caption font-bold text-ink-muted">
              R
            </span>
            Read only
          </span>
          <span className="flex items-center gap-2 text-body-sm text-ink-muted">
            <span className="rounded-chip bg-brand/10 px-1.5 py-0.5 font-mono text-caption font-bold text-brand">
              RE
            </span>
            Read and edit
          </span>
          <span className="flex items-center gap-2 text-body-sm text-ink-muted">
            <span className="rounded-chip bg-danger/10 px-1.5 py-0.5 font-mono text-caption font-bold text-danger">
              RED
            </span>
            Read, edit and delete
          </span>
          <span className="flex items-center gap-2 text-body-sm text-ink-muted">
            <Icon name="close" size={14} className="text-ink-subtle" />
            No access
          </span>
        </div>
        <p className="mt-4 text-body-sm text-ink-muted">
          A system role is structural — it may be reshaped but never deleted, because deleting the
          role every Super Admin holds would lock everyone out of the console at once.
        </p>
      </Card>
    </PageBody>
  );
}
