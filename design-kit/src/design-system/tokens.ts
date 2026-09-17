/**
 * Typed access to the CSS custom properties declared in `app/globals.css`.
 *
 * Use these only where a colour must reach an inline `style` — charts, tinted
 * chips, domain-coloured icon tiles. Everything expressible as a class should
 * use the Tailwind utility (`bg-brand`, `text-ink-muted`) instead.
 */

export const feedbackTokens = {
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
  info: "var(--color-info)",
  neutral: "var(--color-neutral)",
} as const;

export type FeedbackIntent = keyof typeof feedbackTokens;

/**
 * Text-safe shades of the same intents.
 *
 * The base feedback colours are tuned for dots, fills and bars; `success` and
 * `warning` sit near 3:1 on white, which fails WCAG AA for body text. Anything
 * rendering an intent as *text* — status labels, chips, inline messages — must
 * read from here instead.
 */
export const feedbackTextTokens = {
  success: "var(--color-success-strong)",
  warning: "var(--color-warning-strong)",
  danger: "var(--color-danger)",
  info: "var(--color-info)",
  neutral: "var(--color-ink-muted)",
} as const satisfies Record<keyof typeof feedbackTokens, string>;

export const domainTokens = {
  students: "var(--color-domain-students)",
  trainers: "var(--color-domain-trainers)",
  colleges: "var(--color-domain-colleges)",
  courses: "var(--color-domain-courses)",
  "question-bank": "var(--color-domain-question-bank)",
  localisation: "var(--color-domain-localisation)",
} as const;

export type DomainKey = keyof typeof domainTokens;

export const brandTokens = {
  brand: "var(--color-brand)",
  accent: "var(--color-accent)",
  gold: "var(--color-gold)",
  rail: "var(--color-rail)",
  ink: "var(--color-ink)",
  inkMuted: "var(--color-ink-muted)",
  neutral: "var(--color-neutral)",
} as const;

/** Ordered palette for charts that need more than one series colour. */
export const chartPalette = [
  brandTokens.brand,
  brandTokens.accent,
  domainTokens.colleges,
  feedbackTokens.success,
  domainTokens["question-bank"],
  brandTokens.neutral,
] as const;
