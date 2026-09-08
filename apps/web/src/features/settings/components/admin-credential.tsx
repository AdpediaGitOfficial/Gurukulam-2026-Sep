"use client";

import type { ReactNode } from "react";
import type { IssuedAdminCredential } from "@gurukulam/contracts";

import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";

/**
 * A credential, shown once.
 *
 * The API returns it a single time and keeps only its hash, so this panel is
 * the only copy that will ever exist. Nothing emails it. Same shape as the
 * college portal credential, deliberately — an operator should not have to
 * learn two ways of being handed a password.
 */
export function AdminCredential({
  issued,
  action,
}: {
  issued: IssuedAdminCredential;
  /** Where to go once it is written down. */
  action: ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-6">
      <Alert intent="warning" title="Write these down now">
        This is the only time the password is shown. Only its hash is stored, so nobody — including
        this console — can retrieve it later. Losing it means issuing a new one, which invalidates
        this one.
      </Alert>

      <dl className="flex flex-col gap-4">
        <Field label="Sign in with" value={issued.email} />
        <Field label="Temporary password" value={issued.temporaryPassword} />
      </dl>

      <p className="text-body-sm text-ink-muted">
        They must change it at first sign-in — until they do, every screen sends them back to the
        password form.
      </p>

      <div className="flex items-center justify-end gap-3 border-t border-hairline pt-6">{action}</div>
    </Card>
  );
}

/** One credential line: big, monospaced, selectable in a single gesture. */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <dt className="text-body-sm font-medium text-ink">{label}</dt>
      <dd>
        {/* An input rather than text: it selects on click, copies intact, and
            is legible on a phone camera. Read-only, so nothing shown here can
            be edited into something misleading. */}
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
