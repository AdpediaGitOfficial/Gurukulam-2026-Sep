import Image from "next/image";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface PromoBannerProps {
  /** What this module does and why it matters. Two or three lines. */
  description: string;
  /** The module's headline action — usually a `Button variant="accent"`. */
  action?: ReactNode;
  illustration?: {
    src: string;
    alt: string;
    width: number;
    height: number;
  };
  className?: string;
}

/**
 * Introductory banner at the top of a module: what the module is for, its
 * primary action, and a supporting illustration.
 *
 * Copy and illustration are flex siblings so they cannot overlap; the
 * illustration drops out below `lg`, where the copy needs the full width.
 */
export function PromoBanner({ description, action, illustration, className }: PromoBannerProps) {
  return (
    <section
      className={cn(
        "relative flex items-center gap-8 overflow-hidden rounded-card border border-hairline bg-surface-soft p-10",
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -top-20 -right-20 size-64 rounded-full bg-accent-glow opacity-20 blur-3xl"
      />

      <div className="relative flex min-w-0 flex-1 flex-col items-start gap-8">
        <p className="max-w-[672px] text-body leading-[26px] text-on-accent">{description}</p>
        {action}
      </div>

      {illustration ? (
        <Image
          src={illustration.src}
          alt={illustration.alt}
          width={illustration.width}
          height={illustration.height}
          className="relative hidden w-[240px] shrink-0 rounded-well shadow-panel md:block lg:w-[280px] xl:w-[320px]"
        />
      ) : null}
    </section>
  );
}
