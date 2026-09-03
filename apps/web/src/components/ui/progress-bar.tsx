import { brandTokens } from "@/design-system/tokens";
import { cn } from "@/lib/cn";

export interface ProgressBarProps {
  /** 0–100. Values outside the range are clamped. */
  value: number;
  label: string;
  /** Hide the label row and expose `label` to assistive tech only. */
  hideLabel?: boolean;
  color?: string;
  className?: string;
}

export function ProgressBar({
  value,
  label,
  hideLabel = false,
  color = brandTokens.brand,
  className,
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {hideLabel ? null : (
        <div className="flex items-center justify-between gap-4 text-body-sm">
          <span className="text-ink">{label}</span>
          <span className="font-bold text-ink">{Math.round(clamped)}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 w-full overflow-hidden rounded-full bg-neutral"
      >
        <div className="h-full rounded-full" style={{ width: `${clamped}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}
