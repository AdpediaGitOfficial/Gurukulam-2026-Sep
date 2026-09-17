import type { ReactNode } from "react";

/**
 * One label-and-value line in a record's summary card.
 *
 * ── Why this is a pattern and not four local copies ─────────────────────
 *
 * It was four: the account page, the student, the requirement and the session
 * each declared their own `Row` with byte-identical markup. They also carried
 * an identical bug — `shrink-0` on the term meant a long value had nowhere to
 * go, so at 400px the student page could be dragged 46px sideways. One fault
 * in four files is four bugs, and three of them get fixed.
 *
 * ── Why it stacks on a phone ────────────────────────────────────────────
 *
 * Side by side, a label and a value are competing for one line: an email
 * address or a college's full name cannot shrink below its longest word, and
 * the term will not give up its width, so something has to spill. Above ~640px
 * there is room for both and the pair reads as a table, which is what a
 * summary card is for. Below it, the value goes under its own label — the only
 * arrangement that cannot overflow whatever the record happens to contain.
 */
export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-hairline py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <dt className="text-body-sm text-ink-subtle sm:shrink-0">{label}</dt>
      <dd className="min-w-0 break-words text-body-sm font-medium text-ink sm:text-right">
        {value}
      </dd>
    </div>
  );
}
