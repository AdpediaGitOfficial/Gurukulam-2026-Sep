import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "No access" };

/**
 * Shown when a signed-in principal opens a module their role does not include.
 *
 * Deliberately not a raw 403: the person is legitimately signed in, and "ask
 * your administrator" is the only action available to them.
 */
export default function NoAccessPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4">
      <Card className="w-full max-w-[480px]">
        <EmptyState
          title="You do not have access to that"
          description="Your role does not include this module. An administrator can grant it from Settings › Roles."
          action={
            <Link href="/dashboard" className={buttonVariants({ variant: "primary" })}>
              Back to dashboard
            </Link>
          }
        />
      </Card>
    </div>
  );
}
