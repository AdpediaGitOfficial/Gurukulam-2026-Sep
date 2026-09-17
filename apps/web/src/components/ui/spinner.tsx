import { cn } from "@/lib/cn";

export interface SpinnerProps {
  /** Accessible label. Omit only when an adjacent element already announces the wait. */
  label?: string;
  className?: string;
}

export function Spinner({ label = "Loading", className }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        "inline-block size-5 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
    />
  );
}
