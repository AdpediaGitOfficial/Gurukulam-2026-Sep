import { cn } from "@/lib/cn";

const REGIONAL_INDICATOR_OFFSET = 0x1f1e6 - "A".charCodeAt(0);

/** "IN" -> 🇮🇳 */
function toFlagEmoji(alpha2: string): string {
  return [...alpha2.toUpperCase()]
    .map((letter) => String.fromCodePoint(letter.charCodeAt(0) + REGIONAL_INDICATOR_OFFSET))
    .join("");
}

/**
 * The glyph is set ~1.45x the circle so the flag artwork — which is wider than
 * it is tall, with transparent bands above and below — covers the full disc.
 * Oversizing via font-size rather than `scale` keeps it crisp: the emoji font
 * renders a larger bitmap instead of interpolating a small one.
 */
const SIZES = {
  sm: { box: "size-7", glyph: "text-[56px]/none" },
  md: { box: "size-9", glyph: "text-[72px]/none" },
  lg: { box: "size-11", glyph: "text-[88px]/none" },
} as const;

export interface FlagProps {
  /** ISO 3166-1 alpha-2 code, e.g. `IN`. */
  alpha2: string;
  /** Country name, used for the accessible label. */
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}

/**
 * Country flag as a circular avatar.
 *
 * The glyph is scaled past the circle and clipped, so the flag *fills* the disc
 * instead of floating inside a box with transparent bands above and below —
 * which is what made the previous rounded-rectangle treatment read as a grey
 * tile with a small picture in it. Circular also matches the rest of the
 * product's identity language: `Avatar` and the stat icon wells are round.
 *
 * The flag itself is derived from the ISO code rather than a committed image —
 * there are ~250 of them and the set grows with the tenant list. If a platform
 * without flag-emoji support (Windows) becomes a target, swap the glyph for an
 * image sprite here; no caller changes.
 */
export function Flag({ alpha2, name, size = "md", className }: FlagProps) {
  const { box, glyph } = SIZES[size];

  return (
    <span
      role="img"
      aria-label={`${name} flag`}
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-sunken",
        box,
        className,
      )}
    >
      {/* The line-height rides along in the font-size utility (`/none`): as a
          separate `leading-none` class it would be stripped, because
          tailwind-merge treats a font-size as overriding line-height. */}
      <span aria-hidden className={cn("select-none", glyph)}>
        {toFlagEmoji(alpha2)}
      </span>

      {/* Inset hairline so pale flags — Japan, Poland, Finland — keep a defined
          edge instead of dissolving into a white row. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-ink/10 ring-inset"
      />
    </span>
  );
}
