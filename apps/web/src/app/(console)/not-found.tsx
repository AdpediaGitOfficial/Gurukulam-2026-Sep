import Link from "next/link";

import { PageBody } from "@/components/patterns/page-section";
import { PageHeader } from "@/components/patterns/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";

/**
 * A record that is not there.
 *
 * Reached when the API answers 404 to a GET during a render — see `apiFetch`.
 * The common case is not a typed URL: it is a link somebody opened after the
 * record behind it was deleted, which in an operations console with delete on
 * the row happens every day. Saying so is a fact the operator can act on; the
 * blank 500 this replaces was not.
 */
export default function ConsoleNotFound() {
  return (
    <PageBody>
      <PageHeader
        eyebrow="Not found"
        title="That record is not here"
        description="It may have been deleted, or the link may be out of date."
      />

      <Card padding="none">
        <EmptyState
          icon="search"
          title="Nothing at this address"
          description="If you followed a link from somewhere else in the console, the record it pointed at has since been removed. The list it came from is the place to check."
          action={
            <Link href="/dashboard" className={buttonVariants({ variant: "secondary" })}>
              Back to the dashboard
            </Link>
          }
        />
      </Card>
    </PageBody>
  );
}
