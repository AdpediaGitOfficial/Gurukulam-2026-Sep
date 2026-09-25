import type { Metadata } from "next";

import { Alert } from "@/components/ui/alert";
import { Card, CardHeader } from "@/components/ui/card";
import { ChangePasswordForm } from "@/features/auth/components/change-password-form";
import { getMeAccount } from "@/features/me/server/me-service";
import { requireStudent } from "@/server/principal";
import type { SearchParams } from "@/server/list";

export const metadata: Metadata = { title: "Change your password — Gurukulam" };

/**
 * The screen every student sees first.
 *
 * Credentials are issued at allocation with `mustReset` set, so this is not an
 * edge case — it is the first thing a new student lands on, before the portal
 * itself. `/auth/change-password` and `/account` both already answer for a
 * student principal, so the form is the console's: one password rule, one set
 * of messages, one place to change either.
 */
export default async function StudentPasswordPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireStudent();
  const [account, query] = await Promise.all([getMeAccount(), searchParams]);

  const firstLogin = query["reason"] === "first-login" || query["reason"] === "required";
  const required = account.mustResetPassword || firstLogin;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-h1 text-ink">Change your password</h1>
        <p className="text-body-sm text-ink-muted">
          The one thing about your account that is yours to set.
        </p>
      </header>

      {required ? (
        <Alert intent="warning" title="Choose your own before carrying on">
          {/* The issued password travelled to them in a welcome message. It is
              a way in, not a credential. */}
          The password you were given was issued by the office and sent to you in a message.
          Replace it with one only you know.
        </Alert>
      ) : null}

      <Card>
        <CardHeader as="h2" title="New password" />
        <ChangePasswordForm required={required} />
      </Card>
    </div>
  );
}
