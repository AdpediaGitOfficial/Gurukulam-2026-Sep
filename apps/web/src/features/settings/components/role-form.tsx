"use client";

import Link from "next/link";
import { MODULES, type Role } from "@gurukulam/contracts";

import {
  FormSection,
  FormShell,
  FormText,
  FormTextarea,
  FullWidth,
} from "@/components/patterns/form-shell";
import { buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { saveRole } from "@/features/settings/server/actions";

/** How each module reads in the grid. The contract's key is not a label. */
const LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  colleges: "Colleges",
  students: "Students",
  courses: "Courses",
  batches: "Batches",
  trainers: "Trainers",
  feeLedger: "Fee Ledger",
  hiring: "Hiring",
  reports: "Reports",
  requirements: "Requirements",
  certificates: "Certificates",
  notifications: "Notifications",
  settings: "Settings",
};

const ACTIONS = ["read", "edit", "delete"] as const;

export function RoleForm({ role }: { role?: Role }) {
  const editing = role !== undefined;

  return (
    <FormShell
      action={saveRole.bind(null, role?.roleId)}
      errorTitle={editing ? "Could not save that role" : "Could not add that role"}
      submitLabel={editing ? "Save changes" : "Create role"}
      secondary={
        <Link href="/settings/roles" className={buttonVariants({ variant: "secondary" })}>
          Cancel
        </Link>
      }
    >
      <FormSection
        title="The role"
        description="A role is a named set of permissions. Operators are given one; changing it changes what every operator holding it can reach."
      >
        <FormText
          name="name"
          label="Role name"
          required
          placeholder="Regional Sub-Admin"
          defaultValue={role?.name}
        />
        {editing && role.isSystem ? (
          <div className="flex min-w-0 flex-col justify-end pb-2">
            <span className="text-body-sm text-ink-muted">
              This is a system role. Its permissions can be reshaped, but it cannot be deleted —
              the product assumes it exists.
            </span>
          </div>
        ) : null}
        <FullWidth>
          <FormTextarea
            name="description"
            label="What this role is for"
            rows={2}
            placeholder="Runs one region: their own cities' colleges, students and batches."
            defaultValue={role?.description ?? ""}
          />
        </FullWidth>
      </FormSection>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-h3 text-ink">Permissions</h2>
          <p className="mt-1 max-w-2xl text-body-sm text-ink-muted">
            A module left entirely unticked is unreachable — the guard denies it outright, so an
            operator loses the whole surface rather than seeing an empty one. You cannot grant a
            permission you do not hold yourself; the API refuses it rather than silently dropping it.
          </p>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-left" style={{ minWidth: "560px" }}>
            <thead className="bg-surface-sunken">
              <tr>
                <th
                  scope="col"
                  className="px-4 py-3 text-caption font-bold tracking-wide text-ink-muted uppercase"
                >
                  Module
                </th>
                {ACTIONS.map((action) => (
                  <th
                    key={action}
                    scope="col"
                    className="px-4 py-3 text-center text-caption font-bold tracking-wide text-ink-muted uppercase"
                  >
                    {action}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODULES.map((module) => (
                <tr key={module} className="border-t border-hairline">
                  <th scope="row" className="px-4 py-3 text-left text-body font-normal text-ink">
                    {LABELS[module] ?? module}
                  </th>
                  {ACTIONS.map((action) => (
                    <td key={action} className="px-4 py-3 text-center">
                      <Checkbox
                        id={`perm-${module}-${action}`}
                        name={`perm:${module}:${action}`}
                        label={`${LABELS[module] ?? module} — ${action}`}
                        hideLabel
                        defaultChecked={role?.permissions[module]?.[action] === true}
                        className="justify-center"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </FormShell>
  );
}
