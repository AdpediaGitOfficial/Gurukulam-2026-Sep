import type { Metadata } from "next";

import { Alert } from "@/components/ui/alert";
import { ChangePasswordForm } from "@/features/auth/components/change-password-form";
import { TeachCard, TeachPage } from "@/features/teach/components/teach-page";
import { requireTrainer } from "@/server/principal";
import type { SearchParams } from "@/server/list";

export const metadata: Metadata = { title: "Change your password — Gurukulam" };

/**
 * The screen a trainer sees first.
 *
 * Access is issued with `mustReset` set, so this is not an edge case — it is
 * where a new trainer lands before the portal itself. The form is the
 * console's: one password rule, one set of messages, one place to change
 * either, and `/auth/change-password` already answers for any principal.
 */
export default async function TrainerPasswordPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireTrainer();
  const query = await searchParams;
  const required = query["reason"] === "first-login" || query["reason"] === "required";

  return (
    <TeachPage
      eyebrow="Account"
      title="Change your password"
      description="The one thing about your account that is yours to set."
    >
      {required ? (
        <Alert intent="warning" title="Choose your own before carrying on">
          {/* The issued password travelled in a welcome message. It is a way
              in, not a credential. */}
          The password you were given was issued by the office. Replace it with one only you know.
        </Alert>
      ) : null}

      <TeachCard title="New password">
        <ChangePasswordForm required={required} />
      </TeachCard>
    </TeachPage>
  );
}
