import type { Metadata } from "next";

import { DetailRow } from "@/components/patterns/detail-row";
import { Alert } from "@/components/ui/alert";
import { Card, CardHeader } from "@/components/ui/card";
import { portalDate } from "@/features/me/format";
import { MyDetailsForm } from "@/features/me/components/my-details-form";
import { getProfile } from "@/features/me/server/me-service";
import type { SearchParams } from "@/server/list";
import { requireStudent } from "@/server/principal";

export const metadata: Metadata = { title: "Account — Gurukulam" };

/**
 * Who you are, and the narrow set of it you may change.
 *
 * ── Why the locked fields are shown rather than hidden ──────────────────
 *
 * A student who cannot find a field assumes the screen is broken and asks the
 * office. Showing it with the reason answers the question the absence would
 * raise — and each reason is real, not policy for its own sake:
 *
 *   · **Name** is printed on the certificate. Editable after issue, a student
 *     could change what the certificate attests.
 *   · **Email** is how a fee reminder finds its recipient (invariant 6).
 *     Editable, a student could redirect their own invoices.
 *   · **Student code and college** are identity. Changing either re-answers a
 *     question the rest of the system has already answered.
 *
 * ── Why editing is not here yet ─────────────────────────────────────────
 *
 * `PATCH /me` exists and takes phone, alternate phone, the address lines and
 * the postal code. The form for it lands with the next slice; this screen
 * reads, and says so, rather than offering a control that does nothing.
 */
export default async function StudentAccountPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  /* Guarded here as well as in the layout, and for the reason `server/api.ts`
     records about expired sessions: a layout and its page render CONCURRENTLY,
     so the layout redirecting does not stop this page from calling `/me/*`
     with an administrator's token. That call is refused, and the refusal wins
     the race — a correct redirect surfaces as a 500. The console guards in
     both places for the same reason. */
  await requireStudent();

  const [me, query] = await Promise.all([getProfile(), searchParams]);
  const fullName = me.lastName === null ? me.firstName : `${me.firstName} ${me.lastName}`;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-h1 text-ink">Account</h1>
        <p className="text-body-sm text-ink-muted">
          What Gurukulam holds about you, and which address each thing goes to.
        </p>
      </header>

      {query["saved"] === "1" ? (
        <Alert intent="success" title="Saved">
          Your contact details are updated.
        </Alert>
      ) : null}

      <Card>
        <CardHeader as="h2" title="You" />
        <dl>
          <DetailRow label="Name" value={fullName} />
          <DetailRow label="Student code" value={me.studentCode} variant="code" />
          {/* Two addresses, deliberately different: one signs you in, the
              other is where receipts and reminders go. Showing both is what
              stops "I never got the receipt" being a mystery. */}
          <DetailRow label="You sign in with" value={me.loginEmail ?? "—"} variant="code" />
          <DetailRow label="We write to" value={me.email} />
          <DetailRow label="Phone" value={me.phone ?? "Not given"} />
          <DetailRow label="Alternate phone" value={me.altPhone ?? "Not given"} />
          <DetailRow label="City" value={me.cityName ?? "—"} />
          <DetailRow
            label="Enrolled"
            value={portalDate(me.enrolledOn)}
          />
        </dl>
      </Card>

      <Card>
        <CardHeader
          as="h2"
          title="How you are enrolled"
          description={
            me.segment === "COLLEGE"
              ? "Your institution enrolled you and is billed for your course."
              : "You enrolled with us directly."
          }
        />
        <dl>
          <DetailRow
            label="Enrolled through"
            value={me.segment === "COLLEGE" ? "My college" : "Directly with Gurukulam"}
          />
          {me.collegeName === null ? null : (
            <DetailRow label="College" value={me.collegeName} />
          )}
          {/* Invariant 3, said plainly. A college student has no individual
              ledger — not an empty one. An empty Fees page would read as "you
              owe nothing yet"; the truth is that it will never concern them. */}
          {me.segment === "COLLEGE" ? (
            <DetailRow
              label="Fees"
              value="Billed to your college — nothing is owed by you"
            />
          ) : null}
        </dl>
      </Card>

      <Card className="flex flex-col gap-4">
        <CardHeader
          as="h2"
          title="Changing any of this"
          description="Your phone and address are yours to change. Your name, email and student code are set by the office — write to them if one is wrong."
          className="pb-0"
        />
        <MyDetailsForm me={me} />
      </Card>
    </div>
  );
}
