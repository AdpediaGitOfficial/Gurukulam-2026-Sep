# Reusing this design system in another project

The system is deliberately portable: it depends on Tailwind v4 and four small libraries, and no
component imports anything product-specific. This is the checklist to stand it up somewhere else.

There is an export script — `./scripts/export-design-kit.sh ../my-new-app` — that copies the
portable files. Read this first so you know what you are copying and what you must change.

---

## 1. Prerequisites in the target project

Next.js App Router (or any React 19 setup), TypeScript, and Tailwind **v4** — the token layer uses
`@theme`, which v3 does not have.

```bash
npm i clsx tailwind-merge class-variance-authority server-only
```

| Package | Why it is needed |
|---|---|
| `clsx` | Conditional class names |
| `tailwind-merge` | Resolves conflicting utilities so `className` overrides work |
| `class-variance-authority` | Typed component variants |
| `server-only` | Marks data-access modules so they cannot be imported client-side |

---

## 2. Copy in this order

Dependencies point one way — `tokens → primitives → patterns → features`. Copy in the same order
and nothing will be missing.

| # | Path | What it is |
|---|---|---|
| 1 | `src/app/globals.css` | **The token layer.** Merge the `@theme` and `@utility` blocks. |
| 2 | `src/lib/cn.ts` | Class merger. **Must be copied with the tokens — see §4.** |
| 3 | `src/lib/format.ts` | `formatCount`, `formatPercent` |
| 4 | `src/design-system/tokens.ts` | Typed token access for inline styles and charts |
| 5 | `public/icons/*` + `src/components/ui/icon.tsx` | 34 icons and the registry |
| 6 | `src/components/ui/*` | 27 primitives |
| 7 | `src/components/patterns/*` | 10 composed blocks |
| 8 | `src/app/(console)/design-system/page.tsx` + `src/features/design-system/*` | The living style guide |

**Fonts.** The token layer expects two CSS variables. In the target project's root layout:

```tsx
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";

const sans = Plus_Jakarta_Sans({ variable: "--font-plus-jakarta-sans", subsets: ["latin"], display: "swap" });
const mono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"], display: "swap" });
// <body className={`${sans.variable} ${mono.variable}`}>
```

---

## 3. What is generic vs. Gurukulam-specific

**Copy as-is — nothing product-specific inside:**

> `alert` `avatar` `breadcrumbs` `button` `card` `checkbox` `chip` `data-table` `dialog`
> `donut-chart` `drawer` `empty-state` `field` `flag` `icon` `input` `pagination` `progress-bar`
> `select` `skeleton` `spinner` `stacked-bar` `status-pill` `switch` `tabs` `textarea` `tooltip`
>
> `filter-tabs` `filter-toolbar` `form-section` `insight-panel` `list-page` `page-header`
> `page-section` `promo-banner` `setting-toggle` `stat-tile`

**Rebrand before use:**

| Item | Where | Change to |
|---|---|---|
| Brand / accent / rail colours | `globals.css` | Your palette — keep the *roles* (see below) |
| Domain colours | `globals.css`, `design-system/tokens.ts` | Your business domains |
| Fonts | root layout + `--font-*` | Your typefaces |
| Icon set | `public/icons`, `icon.tsx` registry | Your exports |

**Leave behind — these are this product's:**

> `src/components/layout/*` (rail, top bar, shell), `src/features/*` except `design-system`,
> `src/config/navigation.ts`, `src/config/site.ts`, `public/img/*`

The layout shell is worth reading as a reference — a fixed rail, a sticky top bar and a centred
`max-w-content` main — but its nav config is specific to this product.

### Keep the roles when you change the colours

The palette can change completely; the **rules** are what make it a system:

1. **One primary colour for actions.** Not two. "Create a record" looks identical in every module.
2. **A separate colour for selection**, never used for actions.
3. **A structural colour** used on exactly one surface (here, the rail).
4. **Feedback intents need a `-strong` text shade** — vivid greens and oranges fail 4.5:1 as text.
5. **Two border colours** — one for containers, one darker for form controls (3:1 minimum).

---

## 4. The one thing that will silently break

`src/lib/cn.ts` registers the custom scales with tailwind-merge:

```ts
extendTailwindMerge({ extend: { theme: {
  text: ["display", "metric", "metric-sm", "h1", "h2", "h3", "body", "body-sm", "caption", "overline"],
  radius: ["chip", "control", "tile", "well", "card", "panel"],
  shadow: ["raised", "panel", "floating", "overlay"],
  spacing: ["rail", "topbar", "content"],
} } });
```

Without it, tailwind-merge cannot tell a custom font size from a custom colour — both look like
`text-*` — so it files them in one group and **deletes** all but the last:

```
cn("text-white", "text-body")  →  "text-body"   // every primary button loses its white label
cn("text-h3", "text-ink")      →  "text-ink"    // every card heading loses its weight
```

The class is removed from the DOM. The source looks correct, which is why this survives review.

**Add a token to `@theme` without adding its name to `cn.ts` and it will work in isolation and
vanish the moment it meets another utility of the same prefix.** Same trap for line-height: a
font-size utility overrides `leading-*`, so write `text-[52px]/none`, not
`cn("leading-none", "text-[52px]")`.

---

## 5. Verify the port

```bash
npm run build && npm run lint
```

Then open `/design-system`. If tokens did not come across you will see it immediately — swatches
render as transparent, and type specimens all collapse to the same size.

Spot-check the two failure modes above:

```ts
cn("text-white", "text-body")   // expect BOTH classes
cn("text-h3", "text-ink")       // expect BOTH classes
```

---

## 6. Where the rules live

| Document | Contains |
|---|---|
| [brand-guidelines.md](brand-guidelines.md) | Colour meaning, type scale, shape, voice, a11y floor |
| [design-system.md](design-system.md) | Layer rules, button hierarchy, card alignment, token workflow |
| `/design-system` route | Every token and component rendered from the real source |

Keep all three with the code. The living route is the one that stays honest — a component that is
not on it will be rebuilt by the next person who cannot find it.
