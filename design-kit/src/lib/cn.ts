import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge only knows Tailwind's stock scales. Without this, it cannot
 * tell a custom font size from a custom colour — both look like `text-*` — so
 * it treats them as one group and silently drops one.
 *
 * `cn("text-white", "text-body")` returned just `text-body`, which is how every
 * primary button lost its white label; `cn("text-h3", "text-ink")` returned just
 * `text-ink`, dropping the type style from every card heading.
 *
 * These lists mirror the `@theme` namespaces in `app/globals.css`. Adding a
 * token there means adding its name here.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        "display",
        "metric",
        "metric-sm",
        "h1",
        "h2",
        "h3",
        "body",
        "body-sm",
        "caption",
        "overline",
      ],
      radius: ["chip", "control", "tile", "well", "card", "panel"],
      shadow: ["raised", "panel", "floating", "overlay"],
      spacing: ["rail", "topbar", "content"],
    },
  },
});

/**
 * Merges conditional class names and resolves conflicting Tailwind utilities,
 * so every component can accept a `className` override safely.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
