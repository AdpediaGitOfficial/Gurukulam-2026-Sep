import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * The box a wide table scrolls inside.
 *
 * ── Why this is a component and not two utility classes ─────────────────
 *
 * `overflow-x-auto` on a div is the obvious way to scroll a fifteen-column
 * register on a phone, and it was written out by hand at six call sites. It is
 * also not sufficient, in two separate ways, and each site got it wrong
 * independently:
 *
 *   · **It clips paint, not extent.** The card cut the table off at its right
 *     edge exactly as intended, and the table's scrollable width still reached
 *     the root scroller. `/courses` could be dragged 981px sideways into blank
 *     canvas, the fixed rail sitting still and the whole console gone off the
 *     left edge. Nothing on `main`, `body` or `html` stopped it — not
 *     `overflow-x: hidden`, not `overflow-x: clip`. `contain: paint` does,
 *     because it makes this a boundary rather than only a mask.
 *
 *   · **It cannot shrink unless its ancestors let it.** A flex or grid item
 *     defaults to `min-width: auto`, so a 900px table made its section 902px
 *     wide inside a 288px grid track, and the scroller faithfully sized itself
 *     to the section. The containers have to carry `min-w-0` for the scroller
 *     to have anything to scroll. That is why `Card` and `PageSection` set it
 *     rather than leaving it to whoever remembers.
 *
 * The rule the two halves add up to: a table may be as wide as it needs to be,
 * and it may never move the page.
 */
export function TableScroll({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("w-full overflow-x-auto contain-paint", className)}>{children}</div>;
}
