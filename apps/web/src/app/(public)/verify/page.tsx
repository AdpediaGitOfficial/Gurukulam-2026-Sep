import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/input";
import { verifyPath } from "@/lib/safe-path";

export const metadata: Metadata = {
  title: "Check a certificate — Gurukulam",
  description: "Confirm a Gurukulam certificate against our register using its verification code.",
};

/**
 * Where an employer types a code.
 *
 * ── Why this is a plain GET form and not a client component ─────────────
 *
 * The whole form is one field and one button, and a `<form method="get">`
 * submits it with no JavaScript at all. That matters more here than anywhere
 * else in the product: this page is opened by a stranger, on an unknown device,
 * from a link in an email, and possibly with a corporate proxy in the way. The
 * fewer things that must work for it to answer, the more often it answers.
 *
 * The submitted code arrives as `?code=` and is redirected to the clean
 * `/verify/<code>` path, so there is one result page rather than two, and the URL
 * a reader ends up on is the one worth pasting into a record of the check.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const typed = (code ?? "").trim();
  if (typed !== "") redirect(verifyPath(typed));

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="flex min-w-0 flex-col gap-2">
        <h1 className="text-metric break-words text-ink">Check a certificate</h1>
        <p className="text-body text-ink-muted">
          Enter the verification code printed on the certificate, or the one its holder gave you.
          You do not need an account.
        </p>
      </header>

      <form method="get" action="/verify" className="flex flex-col gap-4">
        <TextField
          id="code"
          name="code"
          label="Verification code"
          required
          autoComplete="off"
          spellCheck={false}
          hint="Not the certificate number — the code is a separate string of letters and digits."
        />
        <div className="flex">
          <Button type="submit">Check it</Button>
        </div>
      </form>

      {/* Said here rather than only on the result, because the question a
          suspicious reader arrives with is "can this page be faked", and the
          answer is that it reads the register live. */}
      <p className="text-body-sm text-ink-subtle">
        The answer is read from our register at the moment you ask, so a certificate that has been
        withdrawn stops confirming immediately.
      </p>
    </div>
  );
}
