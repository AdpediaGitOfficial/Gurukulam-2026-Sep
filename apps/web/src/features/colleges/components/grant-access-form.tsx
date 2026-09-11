"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { CollegeDetail, CollegeUser } from "@gurukulam/contracts";

import { FormSection, FormSelect, FormText } from "@/components/patterns/form-shell";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { grantAccess } from "@/features/colleges/server/actions";
import type { GrantState } from "@/features/colleges/types";
import { IDLE } from "@/lib/form";

const DIRECT = "__direct__";

/**
 * Granting portal access.
 *
 * The same endpoint grants, resets and restores, because it matches on the
 * contact's email within the college. Rather than hide that, the form works
 * out which of the three the current selection means and says so on the
 * button — an operator who presses "Grant access" for someone who already has
 * it would otherwise silently invalidate the password they are using.
 */
export function GrantAccessForm({
  college,
  users,
}: {
  college: CollegeDetail;
  users: readonly CollegeUser[];
}) {
  const [state, submit] = useActionState<GrantState, FormData>(
    grantAccess.bind(null, college.collegeId),
    IDLE,
  );
  const [pocId, setPocId] = useState(college.pocs[0]?.pocId ?? DIRECT);
  const [typedEmail, setTypedEmail] = useState("");

  if (state.issued !== undefined) {
    return <IssuedPanel college={college} issued={state.issued} />;
  }

  const contact = college.pocs.find((poc) => poc.pocId === pocId);
  const email = (contact?.email ?? typedEmail).trim().toLowerCase();
  // The API matches case-insensitively within the college, so this is the same
  // test it will apply.
  const existing =
    email === "" ? undefined : users.find((user) => user.email.toLowerCase() === email);

  const verb =
    existing === undefined
      ? "grant"
      : existing.accessStatus === "REVOKED"
        ? "restore"
        : "reset";

  return (
    <Card>
      <form action={submit} className="flex flex-col gap-6">
        {state.status === "error" && state.message !== undefined ? (
          <Alert intent="danger" title="Could not grant access">
            {state.message}
          </Alert>
        ) : null}

        <FormSection
          title="Who is this login for"
          description="A portal account belongs to a person at the college, not to the institution. Their own address stays the contact address — the login identity is derived from the college code."
        >
          <FormSelect
            name="pocSelector"
            label="Contact"
            value={pocId}
            onChange={(event) => setPocId(event.target.value)}
            options={[
              ...college.pocs.map((poc) => ({
                value: poc.pocId,
                label: `${poc.name} · ${poc.email}`,
              })),
              { value: DIRECT, label: "Someone who is not a contact yet" },
            ]}
          />
          {/* Only sent when a real contact is chosen: the API links the account
              to the contact by id, which is what survives an edit. */}
          {pocId === DIRECT ? null : <input type="hidden" name="pocId" value={pocId} />}

          {pocId === DIRECT ? (
            <>
              <FormText name="name" label="Full name" required placeholder="Dr. S. Ramakrishnan" />
              <FormText
                name="email"
                label="Email address"
                type="email"
                required
                placeholder="tpo@example.edu"
                hint="Where correspondence goes. This is not the login."
                value={typedEmail}
                onChange={(event) => setTypedEmail(event.target.value)}
              />
              <FormText name="phone" label="Phone" placeholder="+91 98450 00111" />
            </>
          ) : null}
        </FormSection>

        {verb === "reset" ? (
          <Alert intent="warning" title="This replaces their current password">
            {existing?.name} already has portal access. Granting again issues a new temporary
            password and invalidates the one they are using now — they will be signed out and will
            have to set a new one.
          </Alert>
        ) : verb === "restore" ? (
          <Alert intent="info" title="This restores a revoked account">
            {existing?.name}&rsquo;s access was revoked, which cleared their password. Restoring it
            issues a new temporary one.
          </Alert>
        ) : null}

        <Alert intent="info" title="Nothing is emailed">
          The temporary password is shown once, on the next screen, and never again — no message is
          sent to them. Have a way to pass it on before you continue.
        </Alert>

        <div className="flex items-center justify-end gap-3 border-t border-hairline pt-6">
          <Link
            href={`/colleges/${college.collegeId}`}
            className={buttonVariants({ variant: "secondary" })}
          >
            Cancel
          </Link>
          <Submit
            label={
              verb === "grant"
                ? "Grant access"
                : verb === "reset"
                  ? "Reset password"
                  : "Restore access"
            }
          />
        </div>
      </form>
    </Card>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Issuing…" : label}
    </Button>
  );
}

/**
 * The credential, shown once.
 *
 * The API returns it a single time and keeps only its hash, so this panel is
 * the only copy that will ever exist. It replaces the form rather than sitting
 * beside it, because the next thing an operator does must be to write this
 * down — not to submit again.
 */
function IssuedPanel({
  college,
  issued,
}: {
  college: CollegeDetail;
  issued: NonNullable<GrantState["issued"]>;
}) {
  return (
    <Card className="flex flex-col gap-6">
      <Alert intent="warning" title="Write these down now">
        This is the only time the password is shown. Only its hash is stored, so nobody — including
        this console — can retrieve it later. Losing it means issuing a new one, which invalidates
        this one.
      </Alert>

      <dl className="flex flex-col gap-4">
        <Field label="Login" value={issued.loginEmail} />
        <Field label="Temporary password" value={issued.temporaryPassword} />
      </dl>

      <p className="text-body-sm text-ink-muted">
        They must change it at first sign-in. Their own email address is unchanged and still
        receives correspondence — this login identity is derived from the college code and is
        separate on purpose.
      </p>

      <div className="flex items-center justify-end gap-3 border-t border-hairline pt-6">
        <Link
          href={`/colleges/${college.collegeId}/access`}
          className={buttonVariants({ variant: "primary" })}
        >
          I have written it down
        </Link>
      </div>
    </Card>
  );
}

/** One credential line: big, monospaced, and selectable in one gesture. */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <dt className="text-body-sm font-medium text-ink">{label}</dt>
      <dd>
        {/* An input rather than text: it selects on click, survives a
            copy-paste intact, and is readable on a phone camera. Read-only,
            so nothing here can be edited into something misleading. */}
        <input
          readOnly
          value={value}
          onFocus={(event) => event.currentTarget.select()}
          className="w-full cursor-text rounded-tile border border-hairline bg-surface-sunken px-4 py-3 font-mono text-body text-ink select-all"
        />
      </dd>
    </div>
  );
}
