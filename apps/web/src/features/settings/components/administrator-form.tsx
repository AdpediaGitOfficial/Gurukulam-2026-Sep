"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { AdminUser, City, Role } from "@gurukulam/contracts";

import { FormSection, FormSelect, FormText, LockedField } from "@/components/patterns/form-shell";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { AdminCredential } from "@/features/settings/components/admin-credential";
import {
  createAdministrator,
  updateAdministrator,
} from "@/features/settings/server/actions";
import type { AdminCredentialState } from "@/features/settings/types";
import { IDLE, type FormState } from "@/lib/form";

/**
 * Adding an operator, or editing one.
 *
 * Two things this form is careful about, both of them rules the API enforces
 * and the screen would otherwise contradict:
 *
 *  · Region scope. An EMPTY list is global reach, not "nothing" — so the form
 *    says which it is rather than letting an unticked grid mean the widest
 *    possible grant by accident.
 *
 *  · Invariant 19. Nobody edits their own role, scope or status. On your own
 *    record those controls are shown locked rather than hidden: a field an
 *    operator cannot find reads as a broken screen.
 */
export function AdministratorForm({
  roles,
  cities,
  admin,
  isSelf = false,
}: {
  roles: readonly Role[];
  cities: readonly City[];
  admin?: AdminUser;
  isSelf?: boolean;
}) {
  const editing = admin !== undefined;
  /*
   * Your own record, if this is one.
   *
   * `isSelf` alone does not tell the compiler that `admin` exists — and it is
   * right not to: editing-your-own only makes sense when there is a record to
   * edit. Narrowing here says so once instead of asserting it four times.
   */
  const own = editing && isSelf ? admin : undefined;

  const [createState, createSubmit] = useActionState<AdminCredentialState, FormData>(
    createAdministrator,
    IDLE,
  );
  const [editState, editSubmit] = useActionState<FormState, FormData>(
    updateAdministrator.bind(null, admin?.adminUserId ?? "", isSelf),
    IDLE,
  );

  const state = editing ? editState : createState;
  const submit = editing ? editSubmit : createSubmit;

  const [scoped, setScoped] = useState((admin?.cityScope.length ?? 0) > 0);

  if (!editing && createState.issued !== undefined) {
    return (
      <AdminCredential
        issued={createState.issued}
        action={
          <Link
            href="/settings/administrators"
            className={buttonVariants({ variant: "primary" })}
          >
            I have written it down
          </Link>
        }
      />
    );
  }

  return (
    <Card>
      <form action={submit} className="flex flex-col gap-6">
        {state.status === "error" && state.message !== undefined ? (
          <Alert intent="danger" title={editing ? "Could not save" : "Could not add that operator"}>
            {state.message}
          </Alert>
        ) : null}

        {own !== undefined ? (
          <Alert intent="info" title="This is your own account">
            You can correct your name and phone. Role, region scope and account status are not
            yours to change — another Super Admin does that.
          </Alert>
        ) : null}

        <FormSection title="The operator">
          <FormText
            name="name"
            label="Full name"
            required
            placeholder="Arun Menon"
            defaultValue={admin?.name}
          />
          {editing ? (
            <LockedField
              label="Email address"
              value={admin.email}
              reason="This is their sign-in identity. Changing it would be issuing a new account."
            />
          ) : (
            <FormText
              name="email"
              label="Email address"
              type="email"
              required
              placeholder="arun@gurukulam.com"
              hint="This is their sign-in identity, and cannot be changed afterwards."
            />
          )}
          <FormText
            name="phone"
            label="Phone"
            placeholder="+91 98470 00000"
            defaultValue={admin?.phone ?? ""}
          />
          {own !== undefined ? (
            <LockedField
              label="Role"
              value={own.roleName ?? "—"}
              reason="Invariant 19 — an operator cannot change their own role."
            />
          ) : (
            <FormSelect
              name="roleId"
              label="Role"
              required
              placeholder="Assign a role"
              defaultValue={admin?.roleId}
              hint="You cannot assign a role holding permissions you do not have yourself."
              options={roles.map((role) => ({ value: role.roleId, label: role.name }))}
            />
          )}
          {editing && own === undefined ? (
            <FormSelect
              name="accountStatus"
              label="Account status"
              required
              defaultValue={admin.accountStatus}
              options={[
                { value: "ACTIVE", label: "Active" },
                { value: "INACTIVE", label: "Inactive" },
                { value: "SUSPENDED", label: "Suspended" },
              ]}
            />
          ) : null}
        </FormSection>

        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-h3 text-ink">Region scope</h2>
            <p className="mt-1 max-w-2xl text-body-sm text-ink-muted">
              A scoped operator sees only their own cities&rsquo; colleges, students, batches and
              trainers — the filter is applied inside the services, so it cannot be worked around
              from the URL.
            </p>
          </div>

          {own !== undefined ? (
            <LockedField
              label="Regions"
              value={
                own.cityScope.length === 0
                  ? "Global — every city"
                  : (own.cityNames ?? own.cityScope).join(", ")
              }
              reason="Invariant 19 — an operator cannot widen their own reach."
            />
          ) : (
            <>
              {/* Global is chosen, not defaulted into. An empty list means the
                  widest possible grant, so it should never be what happens
                  when somebody ticks nothing. */}
              <div className="flex w-fit gap-1 rounded-full bg-surface-muted p-1">
                {[
                  { value: false, label: "Global — every city" },
                  { value: true, label: "Specific regions" },
                ].map((option) => (
                  <button
                    key={String(option.value)}
                    type="button"
                    onClick={() => setScoped(option.value)}
                    className={
                      scoped === option.value
                        ? "cursor-pointer rounded-full bg-surface px-5 py-2 text-body-sm font-medium text-ink shadow-raised"
                        : "cursor-pointer rounded-full px-5 py-2 text-body-sm font-medium text-ink-muted transition-colors hover:text-ink"
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {scoped ? (
                <ul className="grid gap-2 sm:grid-cols-3">
                  {cities.map((city) => (
                    <li key={city.cityId}>
                      <Checkbox
                        id={`scope-${city.cityId}`}
                        name="cityScope"
                        value={city.cityId}
                        label={city.name}
                        defaultChecked={admin?.cityScope.includes(city.cityId)}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-body-sm text-ink-muted">
                  They will see every city. A regionally scoped operator cannot grant this — only
                  someone who already has global reach can.
                </p>
              )}
            </>
          )}
        </section>

        <div className="flex items-center justify-end gap-3 border-t border-hairline pt-6">
          <Link
            href="/settings/administrators"
            className={buttonVariants({ variant: "secondary" })}
          >
            Cancel
          </Link>
          <Submit label={editing ? "Save changes" : "Add operator"} />
        </div>
      </form>
    </Card>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}
