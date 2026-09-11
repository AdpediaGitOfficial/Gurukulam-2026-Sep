# Gurukulam TMS Design System

The visual and structural contract for the console. Every new page follows it.

**Companion documents:** [brand-guidelines.md](brand-guidelines.md) for the visual language
(colour meaning, type, voice) and [reuse-kit.md](reuse-kit.md) for porting the system to another
project.

**Live style guide: [`/design-system`](http://localhost:3000/design-system)** — every token and
component rendered from the real source. If something is not on that page, it is not part of the
system yet.

---

## 1. The three layers

| Layer        | Location                  | What lives there                                                    | Rule                                                       |
| ------------ | ------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Tokens**   | `src/app/globals.css`     | Colour, type scale, radii, elevation, layout constants               | The only place a raw value may appear                       |
| **Primitives** | `src/components/ui/`    | `Button`, `Card`, `Chip`, `DataTable`, `TextField`, …                | Domain-agnostic. Never imports from `features/`             |
| **Patterns** | `src/components/patterns/`| `ListPage`, `PageHeader`, `StatTile`, `FilterToolbar`, `InsightPanel`| Composes primitives into page-level blocks                  |

Feature code (`src/features/<module>/`) composes patterns and primitives. It never reaches below
them for a raw hex or a hand-rolled table.

```
tokens  ←  primitives  ←  patterns  ←  features  ←  routes
```

Dependencies point one way only. A primitive importing from a feature is a bug.

---

## 2. Non-negotiables

1. **No raw hex, rgb or px font sizes in components.** Use `bg-brand`, `text-ink-muted`,
   `text-h1`, `rounded-card`, `shadow-raised`. If a value is missing, add a token — do not inline it.
2. **No arbitrary type sizes.** `text-h1`, never `text-[20px]` or `text-xl`. The scale is semantic
   so it can change in one place.
3. **Colours that must go through JavaScript** (chart series, tinted chips, domain accents) come
   from `src/design-system/tokens.ts`, which returns `var(--color-…)` — still a token, just
   reachable from TS.
4. **Server Components by default.** Add `"use client"` only for genuine interactivity. Today only five opt in:
   `NavRailLink`, `Tabs`, `FilterTabs`, `Dialog` and `Drawer`.
5. **Every control has an accessible name.** Icon-only buttons need `aria-label`; inputs need a
   `label`; tables need a `caption`.
6. **Filters and pagination live in the URL**, not client state — views stay shareable and
   server-rendered.
7. **`className` is always accepted** on a component and merged with `cn()`, so callers can adjust
   layout without forking the component.
8. **Every new token must be registered in `src/lib/cn.ts`.** See below — skipping this silently
   deletes classes at runtime.

### Adding a token: the two-file rule

A token lives in **two** places: the `@theme` block in `app/globals.css`, and the scale lists in
`src/lib/cn.ts`.

tailwind-merge only knows Tailwind's stock scales. It cannot tell `text-body` (a custom font size)
from `text-ink` (a custom colour) — both are `text-*` — so it files them in one group and drops all
but the last. That is not a styling nudge; the class is **removed from the DOM**:

```
cn("text-white", "text-body")  →  "text-body"   ← every primary button lost its white label
cn("text-h3", "text-ink")      →  "text-ink"    ← every card heading lost its weight
```

`src/lib/cn.ts` fixes this by declaring the custom `text`, `radius`, `shadow` and `spacing` scales
to tailwind-merge. **Add a token to `@theme` without adding its name there and it will work in
isolation but vanish the moment it meets another utility of the same prefix** — which is exactly
the kind of bug that survives review, because the source looks correct.

The same rule bites line-height: a font-size utility is declared to override `leading-*`, so
`cn("leading-none", "text-[52px]")` drops the leading. Attach it to the size instead —
`text-[52px]/none` — and it survives.

---

## 3. Tokens

Declared in the `@theme` block of `src/app/globals.css`.

### Colour

| Group      | Utilities                                                            |
| ---------- | -------------------------------------------------------------------- |
| Surfaces   | `canvas` `surface` `surface-sunken` `surface-muted` `surface-soft`    |
| Borders    | `hairline` `hairline-strong`                                          |
| Text       | `ink` `ink-muted` `ink-subtle` `on-accent`                            |
| Brand      | `brand` `accent` `rail` `rail-raised`                                 |
| Feedback   | `success` `warning` `danger` `info` `neutral`                         |
| Domains    | `domain-students` `domain-trainers` `domain-colleges` `domain-courses` `domain-question-bank` `domain-localisation` |

**Feedback vs domain.** Feedback intents describe *state* (did it work?). Domain colours identify
*which module* a record belongs to. Never use a domain colour to signal success or failure.

**Two border colours, both on the same blue axis.** `hairline` (`#DFEEFF`, 1.18:1) draws every
container edge, card outline and separator. `hairline-strong` (`#758FAB`, 3.35:1) is reserved for
form controls: an empty input has no fill and no label inside it, so its border is the only thing
showing the field exists. That makes it a UI component boundary under WCAG 1.4.11, which sets a
3:1 floor.

Keeping both in the same family matters as much as the ratio. An earlier pass used a warm tan
(`#847560`) here — it cleared the contrast bar comfortably, but a heavy brown outline sitting among
cool, near-invisible container borders made the search field look like it came from another
product. Pick the lightest value that clears 3:1 **in the same hue family**, not the safest value
in any hue.

Buttons and pagination use `hairline` despite being interactive, because their text labels identify
them without the border.

**Intent as text uses the `-strong` shade.** The base feedback colours are tuned for dots, fills
and bars. On white, `success` (#16a34a) is 3.2:1 and `warning` (#ea580c) is 3.6:1 — both fail WCAG
AA for body text. Read text colours from `feedbackTextTokens`, which substitutes the darker
`--color-success-strong` / `--color-warning-strong`. `StatusPill` already does this: vivid dot,
dark label.

### Type scale

`text-display` · `text-metric` · `text-h1` · `text-h2` · `text-h3` · `text-body` · `text-body-sm` ·
`text-caption` · `text-overline`

One `text-h1` per page — it is the page title, rendered by `PageHeader`.

### Radius & elevation

`rounded-chip` `rounded-control` `rounded-tile` `rounded-well` `rounded-card` `rounded-panel`
`shadow-raised` `shadow-panel` `shadow-floating` `shadow-overlay`

### Layout

`w-rail` (80px navigation rail) · `h-topbar` (94px) · `max-w-content` (1600px)

---

## 4. Building a new module

A new module is a service, a column definition and a route. Roughly 100 lines.
`src/app/(console)/students/page.tsx` is the reference implementation — copy it.

**1. Add the route to the rail** — `src/config/navigation.ts`:

```ts
{ href: "/colleges", label: "Colleges", icon: "nav-colleges" }
```

The rail, active state, tooltip and accessible label all follow automatically.

**2. Define the contract and the data seam** — `src/features/colleges/`:

```
types.ts                     College, CollegeQuery, CollegePage
server/colleges-service.ts   listColleges(), getCollegeSummary()  ← the only API seam
components/colleges-table.tsx  the Column<College>[] definition
```

Mark services `import "server-only"` and return typed DTOs. When the real API arrives, only the
service body changes.

**3. Compose the page** with `ListPage`:

```tsx
<ListPage
  title="Colleges"
  description="B2B partner institutions."
  breadcrumbs={[{ label: "Console", href: "/" }, { label: "Colleges" }]}
  action={<Button>Onboard college</Button>}
  summary={<StatTileGrid>…</StatTileGrid>}
  toolbar={<form action="/colleges" className="contents"><FilterToolbar … /></form>}
  pagination={<Pagination page={…} pageCount={…} hrefForPage={…} />}
>
  <CollegesTable rows={result.rows} filtered={isFiltered} />
</ListPage>
```

**4. Anything not a list** — use `PageBody` + `PageHeader` + `PageSection`, and `SplitLayout`
for a 2:1 main/aside arrangement (as the dashboard does).

---

## 5. Component index

### Primitives — `@/components/ui/*`

| Component                              | Use it for                                          |
| -------------------------------------- | --------------------------------------------------- |
| `Button` / `buttonVariants`            | Actions — see the hierarchy below                   |
| `Card` `CardHeader` `CardBody` `CardFooter` | Any panel on the canvas                        |
| `Chip`                                 | Module tags (`tinted`), panel eyebrows (`solid`), table cells (`pill`), filters (`outline`) |
| `StatusPill` / `StatusDot`             | Record lifecycle, via a feedback intent             |
| `Flag`                                 | Country flag, derived from an ISO alpha-2 code      |
| `Icon`                                 | Every glyph. Masked, so it inherits `currentColor`  |
| `Avatar`                               | People                                              |
| `DataTable<TRow>`                      | Every table. Describe `Column<TRow>[]`              |
| `DonutChart`                           | Share-of-total ring; add `track` for a gauge        |
| `StackedBar`                           | A part-to-whole split that totals 100, as one bar   |
| `ProgressBar`                          | A single 0–100 measure                              |
| `TextField` `SearchField` `SelectField` `TextareaField` `Checkbox` `Switch` | Form input |
| `Field` / `controlClass`               | Building a control the set does not cover           |
| `Alert`                                | In-view messages                                    |
| `EmptyState`                           | Legitimately empty collections. Never a bare "No data" |
| `Skeleton` `SkeletonText` `Spinner`    | Loading                                             |
| `Breadcrumbs` `Pagination` `Tabs`      | Navigation — all link-based                         |
| `Tooltip`                              | Short labels; reveals on hover *and* focus          |
| `Dialog`                               | Short confirmations, on native `<dialog>`           |
| `Drawer` / `DrawerSection`             | Right-hand side sheet for editing a record in place |

### Patterns — `@/components/patterns/*`

| Pattern                     | Use it for                                            |
| --------------------------- | ----------------------------------------------------- |
| `ListPage`                  | The canonical collection page                         |
| `PageBody` `PageSection`    | Page rhythm and labelled regions                      |
| `PageHeader`                | The `h1` block every page opens with                  |
| `SplitLayout`               | 2:1 main/aside                                        |
| `StatTile` `StatTileGrid`   | Headline counts                                       |
| `FilterToolbar`             | Search + filters + row actions above a collection     |
| `FilterTabs`                | Pill tabs that filter a collection through the URL    |
| `PromoBanner`               | Module intro: what it does, its primary action, art   |
| `InsightPanel`              | A lead metric on a coloured panel                     |

### Button hierarchy

One ladder for the whole product. Pick by rank, never by which colour looks nice on the page:

| Rank | Variant | Use for |
| ---- | ------- | ------- |
| 1 | `primary` | The single most important action on the view. Never two. |
| 2 | `secondary` | Supporting actions beside it — cancel, discard, search, export, pagination. A filled `surface-muted` pill, no border. |
| 3 | `ghost` | Icon-only chrome and low-emphasis controls. |
| 4 | `link` | Inline navigation inside a card or a sentence. |
| — | `danger` | Destructive **confirmation** only. |

**There is deliberately no second filled colour.** An earlier pass added an amber `accent` variant
for a module banner, which meant "create a record" was blue on one screen and amber on another —
the exact inconsistency a hierarchy exists to prevent. Module colour belongs to surfaces
(`PromoBanner` is amber), not to the action sitting on them.

**Inactive means filled grey, not outlined.** `secondary` uses the same `surface-muted` (`#EBEBEB`)
fill as an unselected `FilterTabs` pill, so a resting control looks identical whether it is a
Cancel button, a pagination step or a tab you have not selected. Use `ghost` only for icon-only
chrome inside a table row or toolbar, where a filled pill per row would be visual noise.

**Destructive controls rest neutral.** A delete or archive icon is `ghost`, turning red on hover
and focus. A list of twenty rows should not be a wall of red, and `danger` should mean "this is the
irreversible button in a confirmation", not "this row can be deleted".

### Colour in a table row

Aim for **one saturated element per row** — the state. Identity, codes, counts and dates stay
neutral so the eye lands on the thing that varies. The country list once had a blue count chip, a
green status chip and a red delete icon in every row; three signals competing meant none of them
read.

Type in a data cell follows the same two-level rule: the record's name is `text-body`, every other
cell is `text-body-sm`, and a secondary identifier under the name is `text-caption`.

### Aligning cards in a row

Cards sitting side by side must align **with each other**, not just look tidy on their own. Two
rules do most of the work, both applied in `InsightPanel`:

- **Top-align content, never centre it.** `justify-center` offsets each card by half its own
  content height, so a single wrapped line knocks neighbouring cards' figures out of line.
- **Reserve height for text that may wrap.** The panel title carries `min-h-10` (two lines at
  `leading-5`), so everything below it starts at the same offset whether the title runs to one line
  or two.

A big figure and its caption are **one unit**: stack them on a shared left edge with a tight gap,
separated from the heading above. Setting a large figure beside its caption only holds while the
caption fits a line or two — past that the figure floats against a ragged block, and because the
arrangement flips at different widths, nothing lines up from card to card.

---

## 6. Forms

These render on the server, where `useId` is unavailable, so **ids are explicit**. Wire `htmlFor`,
the control `id` and `aria-describedby` to the same base string — `TextField` and friends do this
for you:

```tsx
<TextField id="college-name" label="College name" hint="As registered." required />
```

Filters submit through a plain GET form so the page stays a Server Component:

```tsx
<form action="/colleges" className="contents">
  <FilterToolbar search={<SearchField id="q" name="search" label="Search" />} … />
</form>
```

---

## 7. Icons & illustrations

`public/icons/*.svg` are the exact vectors exported from Figma. `Icon` renders them as CSS masks
over `currentColor`, so one asset serves every state.

To add one: export the SVG from Figma, drop it in `public/icons/`, and register it in `ICONS` in
`src/components/ui/icon.tsx` with its intrinsic width and height. **Never hand-author icon SVG** —
without the real vector data, anything drawn by hand is wrong.

### Character illustrations

**Trim every illustration to its content bounding box before committing it.** Figma exports these
as padded squares — the two dashboard characters arrived in 1024²/768² frames with the figure
filling only ~41% and ~51% of the width. Rendering a padded square at a given box size shows a
character less than half that size, which is why they read as tiny stickers. Trim with:

```bash
python3 -c "from PIL import Image; im=Image.open('f.png').convert('RGBA'); im.crop(im.getbbox()).save('f.png', optimize=True)"
```

Then record the trimmed `width`/`height` alongside the `src` in the feature's data, so `next/image`
reserves the right box and nothing shifts on load.

`InsightPanel` sizes illustrations **by height, with `w-auto`**, and bottom-aligns them with
`self-end`. Height-based sizing keeps every character on the same baseline even when the assets
have different aspect ratios; bottom alignment makes the character stand on the panel's base rather
than float. Copy and illustration are flex siblings, never an absolute overlay, so they cannot
collide at any width. Below `sm` the illustration is hidden — the card is too narrow to carry both.

---

## 8. Extending the system

- **Need a colour?** Add a token to `@theme`, and to `tokens.ts` if TS must read it. Never inline.
- **Need a variant?** Add it to the component's `cva` config so it is named and discoverable —
  do not pass a pile of overrides at the call site.
- **Need a new component?** It belongs in `ui/` if it is domain-agnostic, `patterns/` if it composes
  others, and `features/<module>/components/` if it only ever serves one module.
- **Whatever you add, add it to `/design-system`.** An unlisted component gets rebuilt by the next
  person who cannot find it.
