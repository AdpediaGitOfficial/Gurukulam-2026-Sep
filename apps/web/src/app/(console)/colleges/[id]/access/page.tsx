import type { Metadata } from "next";
import Link from "next/link";
import type { CollegeUser } from "@gurukulam/contracts";

import { PageHeader } from "@/components/patterns/page-header";
import { PageBody, PageSection } from "@/components/patterns/page-section";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { GrantAccessForm } from "@/features/colleges/components/grant-access-form";
import { RevokeAccessForm } from "@/features/colleges/components/revoke-access-form";
import { getCollege, listPortalAccess } from "@/features/colleges/server/colleges-service";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";

export const metadata: Metadata = { title: "Portal access" };

/** What a college portal login can reach. Fixed, and the same for every account. */
const PERMISSIONS: ReadonlyArray<[string, string]> = [
  ["Dashboard", "read"],
  ["Their own college", "read"],
  ["Requirements", "read · raise"],
  ["Their students", "read · add"],
  ["Certificates", "read · submit names"],
];

function Accounts({ collegeId, users }: { collegeId: string; users: readonly CollegeUser[] }) {
  if (users.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No portal accounts yet"
          description="Nobody at this college can sign in. Granting access below creates an account and issues its first password."
        />
      </Card>
    );
  }

  return (
    <Card padding="none" className="overflow-hidden">
      <ul className="flex flex-col">
        {users.map((user) => (
          <li
            key={user.collegeUserId}
            className="flex flex-wrap items-center gap-4 border-b border-hairline p-4 last:border-b-0"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-body font-semibold text-ink">{user.name}</span>
              {/* Two addresses, deliberately different: the login identity is
                  derived from the college code, while their own address is
                  where correspondence and invoices go. */}
              <span className="block text-body-sm text-ink-muted">{user.email}</span>
              {user.loginEmail === null ? null : (
                <span className="block font-mono text-caption text-ink-subtle">
                  signs in as {user.loginEmail}
                </span>
              )}
            </span>

            <span className="text-body-sm text-ink-muted">
              {user.accessStatus === "REVOKED" && user.revokedAt !== null
                ? `Revoked ${user.revokedAt.slice(0, 10)}`
                : user.lastLoginAt === null
                  ? "Never signed in"
                  : `Last seen ${user.lastLoginAt.slice(0, 10)}`}
              {/* Why, next to the account it applies to — so nobody has to ask
                  around to find out why a login stopped working. */}
              {user.revokeReason === null ? null : (
                <span className="block text-caption text-ink-subtle">
                  &ldquo;{user.revokeReason}&rdquo;
                </span>
              )}
            </span>

            <StatusPill
              intent={
                user.accessStatus === "GRANTED"
                  ? "success"
                  : user.accessStatus === "REVOKED"
                    ? "danger"
                    : "neutral"
              }
            >
              {user.accessStatus.toLowerCase()}
            </StatusPill>

            {user.accessStatus === "GRANTED" ? (
              <RevokeAccessForm
                collegeId={collegeId}
                collegeUserId={user.collegeUserId}
                name={user.name}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default async function CollegeAccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("colleges", "edit");
  const { id } = await params;
  const query = await searchParams;
  const [college, users] = await Promise.all([getCollege(id), listPortalAccess(id)]);

  return (
    <PageBody>
      <PageHeader
        eyebrow={college.collegeCode}
        title="Portal access"
        description="Who at this college can sign in, and what they can reach. Access is granted per person, never to the institution as a whole."
        breadcrumbs={[
          { label: "Colleges", href: "/colleges" },
          { label: college.name, href: `/colleges/${college.collegeId}` },
          { label: "Portal access" },
        ]}
      />

      {query["revoked"] === "1" ? (
        <Alert intent="success" title="Access revoked">
          They are signed out now — the account, its live sessions and its password all went
          together. Restoring access issues a new password.
        </Alert>
      ) : null}

      {/* Said plainly rather than discovered: the credentials are real and the
          API honours them, but there is nowhere yet for them to be used. */}
      <Alert intent="warning" title="The college portal is not live yet">
        These credentials work against the API, and the scope behind them is enforced — but the
        portal itself is not built, so there is no page for a college user to sign in to. Grant
        access now only if you are testing, or preparing for the portal shipping.
      </Alert>

      <PageSection
        title="Accounts"
        description="A college user sees only their own institution. They cannot create further logins — only an admin can."
      >
        <Accounts collegeId={college.collegeId} users={users} />
      </PageSection>

      <PageSection
        title="Grant access"
        description="Creates the account and issues its first password, or re-issues one for an account that already exists."
      >
        {college.pocs.length === 0 ? (
          <Card>
            <EmptyState
              title="Add a contact first"
              description="A portal account belongs to a person. This college has none on record yet."
              action={
                <Link
                  href={`/colleges/${college.collegeId}/contacts`}
                  className="text-body text-gold underline-offset-4 hover:underline"
                >
                  Add a contact
                </Link>
              }
            />
          </Card>
        ) : (
          <GrantAccessForm college={college} users={users} />
        )}
      </PageSection>

      <PageSection
        title="What a portal login can reach"
        description="Fixed for every college account, and not editable per person. Changing it is a schema question, not a settings one."
      >
        <Card padding="none" className="overflow-hidden">
          <ul className="flex flex-col">
            {PERMISSIONS.map(([area, level]) => (
              <li
                key={area}
                className="flex items-center justify-between gap-4 border-b border-hairline p-4 last:border-b-0"
              >
                <span className="text-body text-ink">{area}</span>
                <span className="font-mono text-body-sm text-ink-muted">{level}</span>
              </li>
            ))}
          </ul>
        </Card>
      </PageSection>
    </PageBody>
  );
}
