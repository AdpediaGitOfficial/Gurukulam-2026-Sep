import { formatRupees } from "@gurukulam/contracts";

import { StackedBar } from "@/components/ui/stacked-bar";
import { brandTokens } from "@/design-system/tokens";
import { formatCount } from "@/lib/format";

export interface SegmentSplitProps {
  label: string;
  /**
   * Counts as `number`, money as `bigint` paise. Money never becomes a number
   * on the way here: a contract total in paise passes 2^53 at about ₹9 crore,
   * which is inside the range these figures reach.
   */
  retail: number | bigint;
  college: number | bigint;
}

const isMoney = (value: number | bigint): value is bigint => typeof value === "bigint";

const display = (value: number | bigint): string =>
  isMoney(value) ? formatRupees(value, { paise: false }) : formatCount(value);

/**
 * The retail share of a total, as a whole percentage.
 *
 * Computed in the same domain as the values, so a bigint amount never passes
 * through a float on its way to a bar width.
 */
function retailShare(retail: number | bigint, college: number | bigint): number {
  if (isMoney(retail) && isMoney(college)) {
    const total = retail + college;
    return total === 0n ? 0 : Number((retail * 100n) / total);
  }
  const total = Number(retail) + Number(college);
  return total === 0 ? 0 : Math.round((Number(retail) / total) * 100);
}

/**
 * Retail against college, as a bar and as two numbers.
 *
 * The whole product turns on this distinction — retail bills the student,
 * college bills the institution — so a blended total is the one figure that
 * tells an operator nothing. Everything segmented is shown split.
 */
export function SegmentSplit({ label, retail, college }: SegmentSplitProps) {
  const total: number | bigint =
    isMoney(retail) && isMoney(college) ? retail + college : Number(retail) + Number(college);

  const empty = isMoney(total) ? total === 0n : total === 0;
  const share = retailShare(retail, college);
  // The second share is the remainder rather than its own rounding, so the two
  // always sum to 100 and the bar never leaves a sliver of track showing.
  const collegeShare = empty ? 0 : 100 - share;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-body-sm text-ink-muted">{label}</span>
        <span className="text-h3 text-ink tabular-nums">{display(total)}</span>
      </div>

      <StackedBar
        ariaLabel={`${label}: ${display(retail)} retail, ${display(college)} college`}
        segments={[
          { id: "retail", label: "Retail", percentage: share, color: brandTokens.brand },
          { id: "college", label: "College", percentage: collegeShare, color: brandTokens.accent },
        ]}
      />

      <div className="flex justify-between gap-4 text-caption text-ink-muted tabular-nums">
        <span>Retail {display(retail)}</span>
        <span>College {display(college)}</span>
      </div>
    </div>
  );
}
