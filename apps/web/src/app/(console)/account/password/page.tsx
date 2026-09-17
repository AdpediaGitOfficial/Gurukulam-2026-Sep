import type { Metadata } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { Alert } from "@/components/ui/alert";
import { Card, CardHeader } from "@/components/ui/card";
import { ChangePasswordForm } from "@/features/auth/components/change-password-form";
import { getAccount } from "@/features/settings/server/settings-service";
import { requirePrincipal } from "@/server/principal";
import type { SearchParams } from "@/server/list";

export const metadata: Metadata = { title: "Change password" };

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // Not module-gated: everyone signed in can change their own password, and a
  // first-login reset happens before they can reach anything else.
  await requirePrincipal();
  const [account, query] = await Promise.all([getAccount(), searchParams]);

  const firstLogin = query["reason"] === "first-login" || query["reason"] === "required";

  return (
    <PageBody>
      <PageHeader
        eyebrow="Account"
        title="Change your password"
        description="The one credential field that is yours to set."
      />

      {account.mustResetPassword || firstLogin ? (
        <Alert intent="warning" title="Set a password before you carry on">
          {/*
            A bootstrap or reset password has been through a shell, a deploy log
            and possibly a chat window. It is a way in, not a credential.
          */}
          The password you were given was issued to you by someone else, and has
          probably passed through a deploy log or a message on the way. Choose your
          own before doing anything else.
        </Alert>
      ) : null}

      <div className="grid gap-8 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader as="h2" title="New password" />
          <ChangePasswordForm required={account.mustResetPassword || firstLogin} />
        </Card>

        <Card>
          <CardHeader as="h2" title="What this does not change" />
          <p className="text-body-sm text-ink-muted">
            Your name, role and region scope decide what you can see and do, and are set by a
            Super Admin under Settings › Administrators. Letting an operator edit their own scope
            would make the permission model advisory rather than enforced.
          </p>
        </Card>
      </div>
    </PageBody>
  );
}
