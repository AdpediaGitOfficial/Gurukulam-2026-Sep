import { cn } from "@/lib/cn";

/**
 * The Gurukulam logo.
 *
 * ── Two cuts of one asset ───────────────────────────────────────────────
 *
 * The supplied artwork is a VERTICAL lockup — the mark above the wordmark
 * above the tagline, at 250 × 147. That shape is wrong for a 80px navigation
 * rail and right for a sign-in screen, so it ships as two files: the full
 * lockup, and the mark cropped out of it. Both are generated from the same
 * source artwork, so a revised logo regenerates both rather than being redrawn
 * twice.
 *
 * ── It only works on a dark ground ──────────────────────────────────────
 *
 * The wordmark is #ebedeb and the tagline #ffd553. On the console's canvas
 * (#f8f9fa) the wordmark measures about 1.04:1 — it is invisible, not merely
 * low-contrast. So every placement puts it on the rail colour or another dark
 * surface, and the sign-in screen gives it a plate rather than sitting it on
 * the page. Recolouring somebody's brand asset to suit a light background is a
 * decision for whoever owns the brand, not for this component.
 *
 * ── Why an `img` and not an inline SVG ──────────────────────────────────
 *
 * Nothing here needs `currentColor` — the artwork is fixed-colour by design —
 * and an inline copy would carry the artwork's generic `.cls-1` class names
 * into whatever page rendered it, where a second inlined SVG using the same
 * names would repaint it. A file reference cannot collide with anything, and
 * the browser caches one copy across every screen that shows it.
 */

/** Intrinsic sizes, so the box is reserved before the file arrives. */
const ART = {
  mark: { src: "/brand/gurukulam-mark.svg", width: 95, height: 84 },
  lockup: { src: "/brand/gurukulam-lockup.svg", width: 250, height: 147 },
} as const;

export interface LogoProps {
  /**
   * `mark` is the G on its own — for the rail, a favicon slot, anywhere under
   * about 120px. `lockup` adds the wordmark and tagline and needs at least
   * ~170px of width before the tagline stops being readable.
   */
  variant?: keyof typeof ART;
  /** Tailwind width classes. Height follows from the aspect ratio. */
  className?: string;
  /**
   * The logo is decorative wherever a text label sits beside it — the rail
   * already names the product, and repeating it makes a screen reader say it
   * twice.
   */
  decorative?: boolean;
}

export function Logo({ variant = "mark", className, decorative = false }: LogoProps) {
  const art = ART[variant];
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a fixed-colour SVG
    // needs no optimisation pipeline, and next/image would require
    // dangerouslyAllowSVG to serve it at all.
    <img
      src={art.src}
      width={art.width}
      height={art.height}
      alt={decorative ? "" : "Gurukulam"}
      {...(decorative ? { "aria-hidden": true } : {})}
      // `h-auto` with a width class is what keeps it responsive: the caller
      // sets one dimension and the aspect ratio supplies the other, so the
      // artwork can never be squashed by a container it did not expect.
      className={cn("h-auto w-full max-w-full select-none", className)}
      draggable={false}
    />
  );
}
