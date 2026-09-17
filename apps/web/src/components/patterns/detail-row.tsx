import type { ReactNode } from "react";
import Link from "next/link";

import { cn } from "@/lib/cn";

/**
 * One label-and-value line in a record's summary card.
 *
 * ── Why this is a pattern and not six local copies ──────────────────────
 *
 * It was six. Four pages — account, student, requirement, session — declared a
 * `Row` with byte-identical markup, and they carried an identical bug with it:
 * `shrink-0` on the term meant a long value had nowhere to go, so at 400px the
 * student page could be dragged 46px sideways. One fault in four files is four
 * bugs, and three of them get fixed.
 *
 * The other two had drifted rather than duplicated. The certificate page's
 * `Detail` knew how to render a code and a link; the contract page's `Row` knew
 * how to render money and emphasise a total. Neither knew what the other knew,
 * so a certificate number was monospaced on one screen and a contract number
 * was not.
 *
 * ── Why the variants are named for the value, not for the CSS ───────────
 *
 * `mono` and `tabular-nums` are the same intention twice: this value is not
 * prose. A code wants a monospaced face so a human can read it back over the
 * phone; a figure wants tabular digits so a column of them lines up. Saying
 * which KIND of value it is puts that decision in one place — change how the
 * console renders a business ID and every screen showing one changes with it.
 *
 * ── Why it stacks on a phone ────────────────────────────────────────────
 *
 * Side by side, a label and a value compete for one line: an email address or a
 * college's full name cannot shrink below its longest word, and the term will
 * not give up its width, so something has to spill. Above ~640px there is room
 * for both and the pair reads as a table, which is what a summary card is for.
 * Below it, the value goes under its own label — the only arrangement that
 * cannot overflow whatever the record happens to contain.
 */
export interface DetailRowProps {
  label: string;
  value: ReactNode;
  /**
   * What sort of value this is.
   *
   * `code` for anything generated and quoted back — a business ID, a
   * verification code. `figure` for money and counts, so a column of them lines
   * up on the decimal. `text` for everything a person wrote.
   */
  variant?: "text" | "code" | "figure";
  /** Makes the value a link to the record it names. */
  href?: string;
  /**
   * The line the card is really about — a contract's computed total, not its
   * per-student rate. One per card, or the emphasis means nothing. It changes
   * the weight only: a total is not a bigger KIND of number.
   */
  strong?: boolean;
}

export function DetailRow({ label, value, variant = "text", href, strong = false }: DetailRowProps) {
  const body = (
    <dd
      className={cn(
        "min-w-0 break-words text-ink sm:text-right",
        variant === "code" && "font-mono",
        variant === "figure" && "tabular-nums",
        // A record's value is a VALUE — the same size as the same fact in a
        // table cell or a form field. Only the weight changes for the line the
        // card is really about.
        "text-body",
        strong ? "font-semibold" : "font-medium",
      )}
    >
      {href === undefined ? (
        value
      ) : (
        <Link href={href as never} className="text-gold underline-offset-4 hover:underline">
          {value}
        </Link>
      )}
    </dd>
  );

  return (
    <div className="flex flex-col gap-1 border-b border-hairline py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <dt className="text-body-sm text-ink-subtle sm:shrink-0">{label}</dt>
      {body}
    </div>
  );
}
