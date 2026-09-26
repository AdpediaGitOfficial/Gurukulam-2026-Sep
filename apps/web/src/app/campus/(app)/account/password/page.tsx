import type { Metadata } from "next";

import { Alert } from "@/components/ui/alert";
import { ChangePasswordForm } from "@/features/auth/components/change-password-form";
import { CampusCard, CampusPage } from "@/features/campus/components/campus-page";
import { requireCollegeUser } from "@/server/principal";
import type { SearchParams } from "@/server/list";

export const metadata: Metadata = { title: "Change your password — Gurukulam" };

/**
 * The screen a college sees first.
 *
 * Portal access is granted with `mustReset` set and a temporary password shown
 * to the operator exactly once, so this is not an edge case — it is where a new
 * POC lands before the portal itself. The form is the console's: one password
 * rule, one set of messages, and `/auth/change-password` already answers for any
 * principal.
 */
export default async function CampusPasswordPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireCollegeUser();
  const query = await searchParams;
  const required = query["reason"] === "first-login" || query["reason"] === "required";

  return (
    <CampusPage
      eyebrow="Account"
      title="Change your password"
      description="The one thing about your account that is yours to set."
    >
      {required ? (
        <Alert intent="warning" title="Choose your own before carrying on">
          {/* The issued password travelled in a message from us. It is a way in,
              not a credential. */}
          The password you were given was issued by Gurukulam. Replace it with one only you know.
        </Alert>
      ) : null}

      <CampusCard title="New password">
        <ChangePasswordForm required={required} />
      </CampusCard>
    </CampusPage>
  );
}
