import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { CampusCard, CampusPage } from "@/features/campus/components/campus-page";
import { campusDate } from "@/features/campus/format";
import { getCollege } from "@/features/campus/server/campus-service";
import { logout } from "@/features/auth/server/actions";
import { requireCollegeUser } from "@/server/principal";

export const metadata: Metadata = { title: "Account — Gurukulam" };

/**
 * Who is signed in, and for which institution.
 *
 * ── Why both records are on one screen ─────────────────────────────────
 *
 * They are different things and a POC needs each. Several people at one college
 * hold separate logins, and the login identity is derived from the college's
 * CODE rather than from anybody's own address — so "which account am I using?"
 * is a real question here in a way it is not on a trainer's screen, and the
 * answer is a field rather than an assumption.
 *
 * ── Why nothing is editable ────────────────────────────────────────────
 *
 * The college's name is on its students' certificates, its partnership type
 * decides what we may offer it, and the contact address is where invoices go —
 * invariant 6 resolves a contract instalment's recipient through it, so a POC
 * changing it would redirect the institution's billing. Every one of those is
 * an operations decision with consequences the person cannot see from here.
 *
 * Shown locked with a reason rather than hidden: a field that is absent reads as
 * one the product forgot.
 */
export default async function CampusAccountPage() {
  /* Guarded here as well as in the layout — they render concurrently. */
  await requireCollegeUser();

  const college = await getCollege();

  return (
    <CampusPage
      eyebrow="Account"
      title="Your account"
      description="What we hold about the institution and about you."
    >
      <CampusCard title="You">
        <dl className="grid gap-5 sm:grid-cols-2">
          <Field label="Name" value={college.user.name} />
          {college.user.designation === null ? null : (
            <Field label="Role" value={college.user.designation} />
          )}
          <Field
            label="You sign in as"
            value={college.user.loginEmail ?? "—"}
            mono
            hint="Built from your college's code, so it never changes when a contact does."
          />
          <Field
            label="Email"
            value={college.user.email}
            hint="Where we write to you, and where invoices go. Ask us to change it."
          />
          {college.user.phone === null ? null : <Field label="Phone" value={college.user.phone} />}
          {college.user.lastLoginAt === null ? null : (
            <Field label="Last signed in" value={campusDate(college.user.lastLoginAt)} />
          )}
        </dl>
      </CampusCard>

      <CampusCard title="Your institution">
        <dl className="grid gap-5 sm:grid-cols-2">
          <Field label="College" value={college.name} hint="Printed on your students' certificates." />
          <Field label="College ID" value={college.collegeCode} mono hint="Issued once, never changes." />
          {college.partnershipType === null ? null : (
            <Field label="Partnership" value={college.partnershipType} />
          )}
          {college.cityName === null ? null : (
            <Field
              label="City"
              value={[college.cityName, college.stateName].filter(Boolean).join(", ")}
            />
          )}
          {college.website === null ? null : <Field label="Website" value={college.website} />}
        </dl>
      </CampusCard>

      <CampusCard title="Sign in">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/campus/account/password"
            className="text-body-sm font-medium text-brand underline-offset-4 hover:underline"
          >
            Change your password
          </Link>
          <form action={logout} className="ml-auto">
            <Button type="submit" variant="secondary" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </CampusCard>
    </CampusPage>
  );
}

function Field({
  label,
  value,
  hint,
  mono = false,
}: {
  label: string;
  value: string;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-overline text-ink-subtle uppercase">{label}</dt>
      <dd
        className={
          mono
            ? "mt-0.5 font-mono text-body break-all text-ink"
            : "mt-0.5 text-body break-words text-ink"
        }
      >
        {value}
      </dd>
      {hint === undefined ? null : (
        <p className="mt-1 text-body-sm text-ink-subtle">{hint}</p>
      )}
    </div>
  );
}
