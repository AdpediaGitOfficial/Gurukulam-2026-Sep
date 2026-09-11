import Image from "next/image";

import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/cn";

const TONE_BACKGROUND = {
  brand: "bg-brand",
  accent: "bg-accent",
} as const;

export interface InsightPanelProps {
  /** Short uppercase category, rendered as a solid chip. */
  eyebrow: string;
  title: string;
  /** Headline figure, already formatted. */
  metric: string;
  description: string;
  tone: keyof typeof TONE_BACKGROUND;
  illustration?: {
    src: string;
    alt: string;
    /** Intrinsic size of the asset, trimmed to its content. */
    width: number;
    height: number;
  };
  /** Ties the panel's accessible name to its heading. Must be unique per page. */
  id: string;
  className?: string;
}

/**
 * Coloured panel pairing one headline figure with a character illustration.
 *
 * Copy and illustration are flex siblings rather than an absolutely positioned
 * overlay, so the two can never collide at any width. The illustration is sized
 * by height and bottom-aligned, which keeps the character standing on the
 * panel's base instead of floating — and keeps both panels' characters on the
 * same baseline even though the two assets have different aspect ratios.
 */
export function InsightPanel({
  eyebrow,
  title,
  metric,
  description,
  tone,
  illustration,
  id,
  className,
}: InsightPanelProps) {
  const headingId = `insight-${id}`;

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "flex min-h-[243px] gap-3 overflow-hidden rounded-panel px-6 pt-7",
        TONE_BACKGROUND[tone],
        className,
      )}
    >
      {/* Top-aligned, not centred: centring shifts each card by half its own
          content height, so a one-line wrap difference knocks the two panels'
          figures out of alignment with each other. */}
      <div className="flex min-w-0 flex-1 flex-col gap-3 pb-7">
        <Chip variant="solid" color="var(--color-brand)" className="w-fit">
          {eyebrow}
        </Chip>

        {/* Two lines are reserved so the figure below starts at the same offset
            in every panel, whether the title wraps to one line or two. */}
        <h2 id={headingId} className="min-h-10 text-h3 leading-5 text-white text-balance">
          {title}
        </h2>

        {/* Figure and caption are one grouped unit, stacked on a single left
            edge. Side-by-side only holds while the caption fits on one or two
            lines; below that the figure floats against a ragged block, and the
            arrangement flips between breakpoints so nothing aligns card to card. */}
        <div className="mt-1 flex flex-col gap-0.5">
          <p className="text-display text-white tabular-nums">{metric}</p>
          <p className="text-body-sm text-white/85 text-pretty">{description}</p>
        </div>
      </div>

      {illustration ? (
        <Image
          src={illustration.src}
          alt={illustration.alt}
          width={illustration.width}
          height={illustration.height}
          className="hidden h-[164px] w-auto shrink-0 self-end object-contain object-bottom sm:block lg:h-[178px]"
        />
      ) : null}
    </section>
  );
}
