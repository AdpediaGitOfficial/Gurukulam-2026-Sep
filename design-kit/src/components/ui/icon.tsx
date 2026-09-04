import type { CSSProperties } from "react";

import { cn } from "@/lib/cn";

/**
 * Icon registry.
 *
 * Sources are the exact vectors exported from Figma (`public/icons`). They are
 * rendered as CSS masks rather than `<img>` so the glyph inherits `currentColor`
 * — one asset then serves every state (active rail item, muted rail item,
 * domain-tinted KPI, ...) without re-exporting a recoloured copy.
 *
 * Intrinsic sizes come from the design and are applied by default; pass `width`
 * / `height` only when a placement deliberately deviates.
 */
const ICONS = {
  "brand-mark": { src: "/icons/brand-mark.svg", width: 22, height: 18 },
  apps: { src: "/icons/icon-apps.svg", width: 16, height: 16 },
  bell: { src: "/icons/icon-bell.svg", width: 16, height: 20 },
  bolt: { src: "/icons/icon-bolt.svg", width: 16, height: 20 },
  help: { src: "/icons/icon-help.svg", width: 20, height: 20 },
  plus: { src: "/icons/icon-plus.svg", width: 14, height: 14 },
  search: { src: "/icons/icon-search.svg", width: 18, height: 18 },

  close: { src: "/icons/icon-close.svg", width: 14, height: 14 },
  download: { src: "/icons/icon-download.svg", width: 16, height: 16 },
  filter: { src: "/icons/icon-filter.svg", width: 18, height: 12 },
  eye: { src: "/icons/icon-eye.svg", width: 18, height: 12.5 },
  pencil: { src: "/icons/icon-pencil.svg", width: 15, height: 15 },
  trash: { src: "/icons/icon-trash.svg", width: 13, height: 15 },
  "chevron-down": { src: "/icons/icon-chevron-down.svg", width: 24, height: 24 },

  save: { src: "/icons/icon-save.svg", width: 18, height: 18 },
  clock: { src: "/icons/icon-clock.svg", width: 20, height: 20 },
  "section-regional": { src: "/icons/section-regional.svg", width: 20, height: 20 },
  "section-rules": { src: "/icons/section-rules.svg", width: 21, height: 20 },

  "stat-globe": { src: "/icons/stat-globe.svg", width: 26.67, height: 26.67 },
  "stat-city": { src: "/icons/stat-city.svg", width: 24, height: 25.33 },
  "stat-hub": { src: "/icons/stat-hub.svg", width: 32, height: 30.67 },

  "kpi-students": { src: "/icons/kpi-students.svg", width: 30, height: 15 },
  "kpi-trainers": { src: "/icons/kpi-trainers.svg", width: 25, height: 25 },
  "kpi-colleges": { src: "/icons/kpi-colleges.svg", width: 22.5, height: 22.5 },
  "kpi-question-bank": { src: "/icons/kpi-question-bank.svg", width: 25, height: 25 },

  "nav-dashboard": { src: "/icons/nav-dashboard.svg", width: 18, height: 18 },
  "nav-question-bank": { src: "/icons/nav-question-bank.svg", width: 20, height: 20 },
  "nav-courses": { src: "/icons/nav-courses.svg", width: 22, height: 18 },
  "nav-colleges": { src: "/icons/nav-colleges.svg", width: 18, height: 18 },
  "nav-trainers": { src: "/icons/nav-trainers.svg", width: 20, height: 20 },
  "nav-students": { src: "/icons/nav-students.svg", width: 24, height: 12 },
  "nav-localisation": { src: "/icons/nav-localisation.svg", width: 22, height: 20 },
  "nav-settings": { src: "/icons/nav-settings.svg", width: 20, height: 20 },
  "nav-account": { src: "/icons/nav-account.svg", width: 20, height: 20 },
} as const satisfies Record<string, { src: string; width: number; height: number }>;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  name: IconName;
  /** Overrides the intrinsic width from the design, in px. */
  width?: number;
  /** Overrides the intrinsic height from the design, in px. */
  height?: number;
  className?: string;
}

export function Icon({ name, width, height, className }: IconProps) {
  const icon = ICONS[name];
  const mask = `url("${icon.src}") center / 100% 100% no-repeat`;

  const style = {
    width: width ?? icon.width,
    height: height ?? icon.height,
    mask,
    WebkitMask: mask,
  } satisfies CSSProperties;

  // Decorative by definition: every icon here sits next to an accessible label
  // or inside a control that carries its own `aria-label`.
  return <span aria-hidden className={cn("block shrink-0 bg-current", className)} style={style} />;
}
