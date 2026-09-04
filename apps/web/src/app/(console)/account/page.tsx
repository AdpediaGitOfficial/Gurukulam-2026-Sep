import type { Metadata } from "next";

import { ModuleTabs } from "@/components/patterns/module-tabs";
import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { Alert } from "@/components/ui/alert";
import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { getAccount } from "@/features/settings/server/settings-service";
import { requirePrincipal } from "@/server/principal";

export const metadata: Metadata = { title: "Account" };

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-hairline py-3 last:border-b-0">
      <dt className="text-body-sm text-ink-subtle">{label}</dt>
      <dd className="text-right text-body-sm font-medium text-ink">{value}</dd>
    </div>
  );
}

export default async function AccountPage() {
  // Not gated on a module: everyone signed in has an account page.
  await requirePrincipal();
  const account = await getAccount();

  const scope =
    account.collegeScope !== null
      ? "One college"
      : account.cityScope === null
        ? "All regions"
        : account.cityScope.length === 0
          ? "No regions"
          : (account.cityNames ?? account.cityScope).join(" · ");

  return (
    <PageBody>
      <PageHeader
        eyebrow="Account"
        title="My account"
        description="Your photo is yours to change. Everything else is set by a Super Admin — ask one if it is wrong."
      />
      <ModuleTabs />

      {account.mustResetPassword ? (
        <Alert
          intent="warning"
          title="Your password needs changing"
          action={
            <Link href="/account/password" className={buttonVariants({ variant: "primary", size: "sm" })}>
              Change it
            </Link>
          }
        >
          You are signed in on a password someone else issued you.
        </Alert>
      ) : null}

      <div className="grid gap-8 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            as="h2"
            title="Your details"
            description="Managed under Settings › Administrators. Read-only here."
          />

          <div className="mb-6 flex items-center gap-5 border-b border-hairline pb-6">
            <Avatar
              {...(account.photoUrl === null ? {} : { src: account.photoUrl })}
              name={account.name}
              size="lg"
            />
            <div className="min-w-0">
              <p className="text-h2 text-ink">{account.name}</p>
              <p className="text-body-sm text-ink-muted">{account.email}</p>
            </div>
          </div>

          <dl>
            <Detail label="Role" value={account.roleName ?? "—"} />
            <Detail label="Region scope" value={scope} />
            <Detail label="Account type" value={account.actor.replace(/_/g, " ").toLowerCase()} />
            <Detail
              label="Last signed in"
              value={
                account.lastLoginAt === null
                  ? "—"
                  : new Date(account.lastLoginAt).toLocaleString("en-IN")
              }
            />
          </dl>
        </Card>

        <Card>
          <CardHeader
            as="h2"
            title="Security"
            action={
              <Link href="/account/password" className="text-body-sm text-gold underline-offset-4 hover:underline">
                Change password
              </Link>
            }
          />
          <p className="mb-6 text-body-sm text-ink-muted">
            Your password is the one credential field you may set for yourself.
          </p>

          <CardHeader as="h2" title="Why the rest is locked" />
          <p className="text-body-sm text-ink-muted">
            Name, email, role and region scope decide what you can see and do. Letting an operator
            edit their own scope would make the permission model advisory — so the API accepts only
            the photo from this page, and refuses anything else outright rather than accepting it
            and quietly discarding it.
          </p>
          <p className="mt-4 text-body-sm text-ink-muted">
            A Super Admin changes these under Settings › Administrators.
          </p>
        </Card>
      </div>
    </PageBody>
  );
}
