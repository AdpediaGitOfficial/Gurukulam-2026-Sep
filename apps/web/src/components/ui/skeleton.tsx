import { cn } from "@/lib/cn";

export interface SkeletonProps {
  className?: string;
}

/** Loading placeholder. Match the footprint of the content it stands in for. */
export function Skeleton({ className }: SkeletonProps) {
  return <div aria-hidden className={cn("animate-pulse rounded-control bg-surface-muted", className)} />;
}

export interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={cn("h-4", index === lines - 1 && "w-2/3")} />
      ))}
    </div>
  );
}
