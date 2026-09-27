import { cn } from "@/lib/cn";

export interface SegmentTagProps {
  segment: "RETAIL" | "COLLEGE";
  className?: string;
}

/**
 * Retail or college, in one glance.
 *
 * The distinction runs through the whole product — retail bills the student,
 * college bills the institution, and the two rosters never mix — so it gets a
 * consistent treatment everywhere it appears rather than being spelled out in
 * prose per table.
 */
export function SegmentTag({ segment, className }: SegmentTagProps) {
  const retail = segment === "RETAIL";

  return (
    <span
      className={cn(
        // `w-fit` because a flex column stretches its children: without it the
        // tag fills the whole table cell and reads as a coloured band.
        // `text-caption` because this is a BADGE, and the console has one badge
        // size: `Chip` tinted is 12px bold and these two sit in peer cells of
        // the same table. It was 10px, which made the same kind of thing read
        // as two kinds.
        "inline-flex h-[22px] w-fit items-center rounded-full px-2.5 text-caption font-bold",
        retail ? "bg-danger/10 text-danger" : "bg-brand/10 text-brand",
        className,
      )}
    >
      {retail ? "Retail" : "College"}
    </span>
  );
}
