"use client";

import { useEffect } from "react";
import Link from "next/link";

import { PageBody } from "@/components/patterns/page-section";
import { PageHeader } from "@/components/patterns/page-header";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * The console's last resort when a render throws.
 *
 * Until this existed there was no error boundary anywhere in the app, so ANY
 * failure below a page — an API restart, an expired token, a filter value the
 * API refused — took the whole screen to Next's blank 500. That is the worst
 * possible presentation of a recoverable problem: the operator learns nothing,
 * can do nothing, and has nothing to quote to whoever is on support.
 *
 * ── Why this does not show the error message ─────────────────────────────
 *
 * It cannot, and pretending otherwise would be the bug. React strips a Server
 * Component error down to `{ message, digest }` before it reaches the client
 * in production — `message` becomes a generic sentence and the API's own
 * "Check the highlighted fields" never arrives. So this shows the one thing
 * that IS real and IS useful: the digest, which is printed beside the stack in
 * the server log. An operator who quotes it can be matched to the exact
 * failure in seconds.
 *
 * The specific, legible failures are handled where the real error still
 * exists: on the server. A 404 renders `not-found.tsx`; a filter value the API
 * would refuse is dropped before the request is made. This catches what is
 * left.
 */
export default function ConsoleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The client half of the record. The server half is already in the log.
    console.error(error);
  }, [error]);

  return (
    <PageBody>
      <PageHeader
        eyebrow="Something went wrong"
        title="This screen could not be loaded"
        description="The rest of the console is unaffected. Nothing you were looking at has been changed."
      />

      <Card>
        <Alert intent="danger" title="The server could not finish rendering this page">
          This is usually momentary — a restart, or a request that timed out. Try again first.
        </Alert>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {/* `reset` re-renders the segment. A transient failure clears here
              and the operator never leaves the screen they were on. */}
          <Button onClick={reset}>Try again</Button>
          <Link href="/dashboard" className={buttonVariants({ variant: "secondary" })}>
            Back to the dashboard
          </Link>
        </div>

        {error.digest === undefined ? null : (
          <p className="mt-6 border-t border-hairline pt-6 text-body-sm text-ink-muted">
            If it keeps happening, quote this reference — it identifies the exact failure in the
            server log: <span className="font-mono text-ink">{error.digest}</span>
          </p>
        )}
      </Card>
    </PageBody>
  );
}
