import type { SVGProps } from "react";

import { cn } from "@/lib/cn";

/**
 * Icon registry.
 *
 * Paths are taken verbatim from the locked design (`docs/prototype/index.html`),
 * which draws every glyph as a 24-grid stroke at weight 1.6. They are inline
 * SVG rather than CSS masks so a glyph can be drawn at any size without a
 * second asset, and so `currentColor` reaches the stroke directly.
 *
 * A few names the console needs are not in the prototype's own set — `close`,
 * `filter`, `eye`, `pencil`, `trash`, `save`, `help` — and are drawn here on the
 * same grid at the same weight.
 */
const ICONS = {
  // Navigation — the nine modules, then the two system entries.
  dash: '<path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z"/>',
  college: '<path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6"/>',
  users:
    '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.2a3.5 3.5 0 0 1 0 5.6M17.5 20a6.5 6.5 0 0 0-2.2-4.9"/>',
  book: '<path d="M4 4h7a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z"/><path d="M20 4h-7a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h7z"/>',
  batch: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  trainer:
    '<path d="M3 4h18v12H3z"/><path d="M12 16v4M8 20h8"/><circle cx="12" cy="9" r="2.5"/>',
  rupee:
    '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M7 9h8M7 12h8M12 9c0 3-2 3-5 3l4 4"/>',
  brief:
    '<rect x="2.5" y="7" width="19" height="13" rx="2"/><path d="M8.5 7V5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2M2.5 12h19"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  acct: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6 19a6.5 6.5 0 0 1 12 0"/>',

  // Chrome.
  mark: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  bell: '<path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7"/><path d="M13.7 20a2 2 0 0 1-3.4 0"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  apps:
    '<circle cx="6" cy="6" r="1.8"/><circle cx="12" cy="6" r="1.8"/><circle cx="18" cy="6" r="1.8"/><circle cx="6" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="18" cy="12" r="1.8"/><circle cx="6" cy="18" r="1.8"/><circle cx="12" cy="18" r="1.8"/><circle cx="18" cy="18" r="1.8"/>',

  // Actions and states.
  plus: '<path d="M12 5v14M5 12h14"/>',
  down: '<path d="M12 4v11M7.5 11l4.5 4 4.5-4M5 20h14"/>',
  check: '<path d="M4 12.5l5 5L20 6.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  mail: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  seal: '<circle cx="12" cy="9" r="6"/><path d="M8.5 14L7 22l5-2.5L17 22l-1.5-8"/>',
  task: '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 13l2 2 4-4"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/>',
  brain:
    '<path d="M9 4a3 3 0 0 0-3 3a3 3 0 0 0-1 5.8V15a3 3 0 0 0 4 2.8V20h4V4z"/><path d="M15 4a3 3 0 0 1 3 3a3 3 0 0 1 1 5.8V15a3 3 0 0 1-4 2.8"/>',
  yt: '<rect x="2" y="5" width="20" height="14" rx="4"/><path d="M10 9l5 3-5 3z"/>',
  warn: '<path d="M12 3l9.5 16.5H2.5z"/><path d="M12 10v4M12 17.5v.01"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 3.5L16 11H5"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18"/>',

  // Drawn here, on the prototype's grid and weight.
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  filter: '<path d="M3 6h18M6.5 12h11M10 18h4"/>',
  eye: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="3"/>',
  pencil: '<path d="M4 20h4L20 8a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M14.5 5.5l4 4"/>',
  trash:
    '<path d="M4 7h16M10 4h4M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h7V3M8 21v-7h8v7"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.2 2.4c-.7.2-1.2.9-1.2 1.6v.5M12 17.5v.01"/>',
} as const satisfies Record<string, string>;

export type IconName = keyof typeof ICONS;

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  name: IconName;
  /** Drawn square at this many px. */
  size?: number;
  className?: string;
}

export function Icon({ name, size = 22, className, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      // Decorative by definition: every icon here sits next to an accessible
      // label, or inside a control that carries its own `aria-label`.
      aria-hidden
      focusable="false"
      className={cn("block shrink-0", className)}
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
      {...props}
    />
  );
}
