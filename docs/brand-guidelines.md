# Gurukulam — Brand & Style Guide

The visual language of the Gurukulam TMS console, written to be reused. Everything here is
implemented in code; see [design-system.md](design-system.md) for the engineering rules and
[reuse-kit.md](reuse-kit.md) for porting it to a new project.

A live, rendered version of this guide runs at **`/design-system`** in any app that uses the kit.

---

## 1. Brand foundations

### The palette has three brand colours and one supporting metal

| Role | Token | Hex | What it means | Where it appears |
|---|---|---|---|---|
| **Primary** | `brand` | `#0058BB` | Action. The one thing to do on this screen. | Primary buttons, links in charts, active tab underline, focus ring |
| **Accent** | `accent` | `#F9AB00` | Selection and highlight. | Selected tab, active nav item, module banners |
| **Structure** | `rail` | `#B63A13` | The product's frame. | Navigation rail only |
| **Metal** | `gold` | `#805600` | Quiet emphasis on a light ground. | In-card links, drawer subtitles |

**The rail colour is structural, not decorative.** Terracotta appears on exactly one surface — the
navigation rail — and never inside content. It is what makes the product recognisable at a glance
in a screenshot.

**Blue is for doing, amber is for showing.** A blue element is something you click to make
something happen. An amber element is something the system has marked as current or important.
Never use amber for a primary action or blue for a selected state — that inversion is the fastest
way to make the product feel like two products.

### Surfaces

| Token | Hex | Use |
|---|---|---|
| `canvas` | `#F8F9FA` | The page behind everything |
| `surface` | `#FFFFFF` | Cards, drawers, panels |
| `surface-sunken` | `#F8F9FA` | Table headers, wells inside a card |
| `surface-muted` | `#EBEBEB` | Resting fill for inactive controls — secondary buttons, unselected tabs |
| `surface-soft` | `#FFFBF2` | Warm panel for module banners |

### Borders — there are two, deliberately

| Token | Hex | Contrast | Use |
|---|---|---|---|
| `hairline` | `#DFEEFF` | 1.18:1 on white | Every container edge and separator |
| `hairline-strong` | `#758FAB` | 3.35:1 on white | **Form controls only** |

An empty input has no fill and no label inside it, so its border is the only thing showing a field
exists. WCAG 1.4.11 puts a 3:1 floor on that. Both borders sit on the same blue axis — an earlier
version used a warm tan for form fields, which cleared the contrast bar but made the search box
look like it came from a different product.

### Text

| Token | Hex | Use |
|---|---|---|
| `ink` | `#191C1D` | Headings, record names, primary values |
| `ink-muted` | `#524533` | Captions, hints, secondary cells |
| `ink-subtle` | `#6B7280` | Placeholders, tertiary identifiers |
| `on-accent` | `#5C3D00` | Text on amber (darkened from `#664400` to clear 4.5:1) |

### Feedback intents

Each intent has a **base** for fills, dots and bars, and a **strong** shade for text.

| Intent | Base | Strong | Base on white |
|---|---|---|---|
| Success | `#16A34A` | `#166534` | 3.2:1 — **fails as text** |
| Warning | `#EA580C` | `#9A3412` | 3.6:1 — **fails as text** |
| Danger | `#BA1A1A` | (same) | 6.2:1 |
| Info | `#0058BB` | (same) | 6.7:1 |
| Neutral | `#E1E3E4` | `ink-muted` | — |

Anything rendering an intent as *text* reads from the strong shade. `StatusPill` does this
automatically: vivid dot, dark label.

### Domain colours

Identify *which module* a record belongs to. Never used to signal state.

| Domain | Hex |
|---|---|
| Students | `#BA1A1A` |
| Trainers | `#0058BB` |
| Colleges / Localisation | `#B12D00` |
| Question Bank / Courses | `#805600` |

---

## 2. Typography

**Plus Jakarta Sans** for everything; **JetBrains Mono** for identifiers — record IDs, ISO codes,
timezones, postal codes. Anything a user might read character-by-character or copy goes in mono.

The scale is **semantic, not sized**. Write `text-h1`, never `text-[20px]` — that is what lets the
scale change in one place.

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `text-display` | 36 / 40 | 700 | Hero figure on a coloured panel |
| `text-metric` | 30 / 36 | 700 | Figure at the centre of a chart |
| `text-metric-sm` | 25 / 32 | 700 | Figure inside a compact ring |
| `text-h1` | 20 / 28 | 600 | Page title — one per page |
| `text-h2` | 18 / 24 | 600 | Section heading |
| `text-h3` | 16 / 24 | 600 | Card heading |
| `text-body` | 16 / 24 | 400 | Default copy, record names |
| `text-body-sm` | 14 / 20 | 400 | Secondary copy, labels, data cells |
| `text-caption` | 12 / 16 | 400 | Captions, IDs, metadata |
| `text-overline` | 10 / 15 | 700, +0.5px | Uppercase eyebrow |

**Two levels in a data cell.** The record's name is `text-body`; every other cell is
`text-body-sm`; a secondary identifier under the name is `text-caption`.

---

## 3. Shape and depth

| Radius | Value | Use |
|---|---|---|
| `rounded-chip` | 4px | Tinted tags |
| `rounded-control` | 8px | Small controls, tooltips |
| `rounded-tile` | 12px | Form fields, icon tiles |
| `rounded-well` | 16px | Icon wells, inline alerts |
| `rounded-card` | 24px | Cards, drawers, banners |
| `rounded-panel` | 31px | Full-bleed coloured panels |

Pills (`rounded-full`) are reserved for **buttons, tabs, chips and search**. A rectangle says
"this is a value you are editing"; a pill says "this is a control you press or type into".

| Shadow | Use |
|---|---|
| `shadow-raised` | Buttons, form cards |
| `shadow-panel` | Illustrations lifted off a panel |
| `shadow-floating` | Tooltips |
| `shadow-overlay` | Drawers, modals |

---

## 4. Layout

| Token | Value |
|---|---|
| `w-rail` | 80px — fixed navigation rail, all breakpoints |
| `h-topbar` | 94px — sticky top bar |
| `max-w-content` | 1600px — content column, centred |

**Vertical rhythm is `gap-8` (32px)** between a page's top-level blocks, set once by `PageBody`.
Cards are `p-6` (24px) or `p-8` (32px) for form cards.

**Breakpoints that matter:** `sm` 640 (illustrations appear), `lg` 1024 (two-up panels),
`xl` 1280 (three-up). Grids of three go 3-across at `lg`, never 2 + 1.

### Page templates

| Template | Shape |
|---|---|
| **Dashboard** | Header → stat tiles → coloured insight panels → full-width table |
| **List** | Header → tabs → banner → stat tiles → filter toolbar → table → pagination |
| **Form** | Header → centred 896px card → icon-led sections → footer with note + actions |
| **Detail edit** | Right-hand drawer over the list, opened by a URL parameter |

---

## 5. Iconography and illustration

**Icons are exported vectors, rendered as CSS masks over `currentColor`** — one asset serves every
state (white in the rail, dark on amber, domain-tinted on a stat tile) without recoloured copies.
Never hand-author icon SVG; without the real vector data anything drawn by hand is wrong.

**Trim illustrations to their content bounding box before committing.** Design tools export them
as padded squares — a character filling 41% of its frame renders at less than half the box you give
it. Size them by **height** with `w-auto` and bottom-align them, so characters of different aspect
ratios share a baseline and stand on the panel's base rather than floating.

**Flags derive from ISO codes**, not committed images — there are ~250 of them. Rendered as a
circular avatar with the glyph oversized 2× and clipped, so the flag fills the disc.

---

## 6. Voice

Interface copy is **plain, specific and consequence-first**.

| Instead of | Write |
|---|---|
| "No data" | "No countries match those filters" |
| "Invalid input" | "Must be exactly two letters, e.g. AE" |
| "Are you sure?" | "Archiving hides the country from operational pickers. It can be restored later." |
| "Error" | "This country could not be onboarded" |

Sentence case for labels and buttons. Title Case only for page titles and proper nouns. Every empty
state names what is missing *and* what to do next. Every destructive confirmation states what
survives the action.

---

## 7. Accessibility floor

Non-negotiable, and already met by the components:

- **4.5:1** for body text, **3:1** for large text and UI component boundaries
- Every control has an accessible name; icon-only buttons carry `aria-label`
- Errors are identified in text, tied to their field with `aria-describedby` and `aria-invalid`
- A visible 2px focus ring on `:focus-visible`, never suppressed
- Semantic landmarks, one `h1` per page, no heading level skips
- Reflows to 320px equivalent with no horizontal scroll
- `prefers-reduced-motion` collapses all transitions
